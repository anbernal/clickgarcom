import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { DomainOutboxEvent } from '../../entities/domain-outbox-event.entity';
import { AmqpService } from '../amqp/amqp.service';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 50;
const MAX_BACKOFF_MS = 15 * 60 * 1_000;

/**
 * Delivers the transactional Delivery outbox to RabbitMQ.
 *
 * The database row remains the source of truth. Publishing and marking a row
 * as published happen in the same transaction so a failed publish is retried.
 * A broker ack followed by a database rollback can still replay a message;
 * consumers therefore use the stable event_id for deduplication.
 */
@Injectable()
export class DeliveryOutboxRelayService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DeliveryOutboxRelayService.name);
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(DomainOutboxEvent)
        private readonly outboxRepository: Repository<DomainOutboxEvent>,
        private readonly amqpService: AmqpService,
    ) {}

    onModuleInit() {
        if (String(process.env.DELIVERY_OUTBOX_RELAY_ENABLED || 'true').toLowerCase() === 'false') {
            this.logger.warn('Delivery outbox relay is disabled by DELIVERY_OUTBOX_RELAY_ENABLED=false');
            return;
        }
        const interval = positiveInteger(process.env.DELIVERY_OUTBOX_RELAY_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
        this.timer = setInterval(() => void this.runOnce(), interval);
        this.timer.unref();
        void this.runOnce();
        this.logger.log(`Delivery outbox relay started (interval=${interval}ms)`);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async runOnce(): Promise<{ processed: number; failed: number }> {
        if (this.running || !this.dataSource.isInitialized) return { processed: 0, failed: 0 };
        this.running = true;
        try {
            return await this.dataSource.transaction(async (manager) => {
                const batchSize = positiveInteger(process.env.DELIVERY_OUTBOX_RELAY_BATCH_SIZE, DEFAULT_BATCH_SIZE);
                const events = await manager.getRepository(DomainOutboxEvent)
                    .createQueryBuilder('event')
                    .where('event.published_at IS NULL')
                    .andWhere('(event.next_retry_at IS NULL OR event.next_retry_at <= NOW())')
                    .orderBy('event.occurred_at', 'ASC')
                    .addOrderBy('event.created_at', 'ASC')
                    .take(batchSize)
                    .setLock('pessimistic_write')
                    .setOnLocked('skip_locked')
                    .getMany();

                let processed = 0;
                let failed = 0;
                for (const event of events) {
                    try {
                        await this.amqpService.publishDomainOutboxEvent({
                            eventId: event.eventId || event.id,
                            eventType: event.eventType,
                            tenantId: event.tenantId,
                            aggregateId: event.aggregateId,
                            occurredAt: event.occurredAt,
                            payload: event.payload,
                        });
                        event.publishedAt = new Date();
                        event.nextRetryAt = null;
                        event.lastError = null;
                        await manager.getRepository(DomainOutboxEvent).save(event);
                        processed += 1;
                    } catch (error) {
                        failed += 1;
                        event.attempts = (event.attempts || 0) + 1;
                        event.nextRetryAt = new Date(Date.now() + backoffMs(event.attempts));
                        event.lastError = safeErrorMessage(error);
                        await manager.getRepository(DomainOutboxEvent).save(event);
                        this.logger.warn(`Delivery outbox event ${event.eventId || event.id} failed; retry ${event.attempts} scheduled`);
                    }
                }
                return { processed, failed };
            });
        } catch (error) {
            this.logger.error(`Delivery outbox relay run failed: ${safeErrorMessage(error)}`);
            return { processed: 0, failed: 0 };
        } finally {
            this.running = false;
        }
    }
}

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function backoffMs(attempt: number): number {
    const exponent = Math.min(Math.max(attempt - 1, 0), 10);
    return Math.min(5_000 * (2 ** exponent), MAX_BACKOFF_MS);
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

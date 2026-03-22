import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { connect } from 'amqplib';

@Injectable()
export class AmqpService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AmqpService.name);
    private connection: any = null;
    private channel: any = null;
    private readonly url = process.env.RABBITMQ_URL || 'amqp://clickgarcom:clickgarcom123@localhost:5672/';
    private readonly tableEventsQueue = 'admin.table.events';
    private readonly kdsEventsQueue = 'kds.events';

    async onModuleInit() {
        await this.connect();
    }

    async onModuleDestroy() {
        if (this.channel) {
            await this.channel.close().catch(() => undefined);
            this.channel = null;
        }
        if (this.connection) {
            await this.connection.close().catch(() => undefined);
            this.connection = null;
        }
    }

    private async connect() {
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                this.connection = await connect(this.url);
                this.channel = await this.connection.createChannel();
                await this.channel.assertQueue(this.tableEventsQueue, { durable: true });
                await this.channel.assertQueue(this.kdsEventsQueue, { durable: true });
                this.logger.log('Connected to RabbitMQ successfully');
                return;
            } catch (error) {
                this.logger.error(`Failed to connect to RabbitMQ (attempt ${attempt}/5): ${(error as Error).message}`);
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }

        this.logger.warn('RabbitMQ unavailable after retries. Admin API will continue running without event publishing.');
    }

    async publishTableEvent(requestId: string, action: 'APPROVE' | 'REJECT') {
        await this.publishToQueue(
            this.tableEventsQueue,
            {
                request_id: requestId,
                action,
            },
            'admin.table.event',
        );

        this.logger.debug(`Published table event for request ${requestId} with action ${action}`);
    }

    async publishKDSEvent(payload: Record<string, unknown>, eventType: string) {
        await this.publishToQueue(this.kdsEventsQueue, payload, eventType);
    }

    private async publishToQueue(queueName: string, payload: Record<string, unknown>, eventType: string) {
        if (!this.channel) {
            await this.connect();
        }

        if (!this.channel) {
            throw new Error('RabbitMQ channel is not available');
        }

        await this.channel.assertQueue(queueName, { durable: true });
        this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), {
            contentType: 'application/json',
            persistent: true,
            type: eventType,
            timestamp: Date.now(),
        });
    }
}

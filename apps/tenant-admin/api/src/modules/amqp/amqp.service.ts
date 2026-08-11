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
    private readonly portalConversationQueue = 'portal.conversation.inputs';
    private readonly portalOrderStatusQueue = 'portal.order.status.events';
    private readonly deliveryRealtimeQueue = 'delivery.realtime.events';
    private readonly eventsExchange = 'clickgarcom.events';
    private readonly fulfillmentRoutingKey = 'delivery.fulfillment.events';
    private readonly domainRoutingKey = 'delivery.domain.events';

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
                await this.channel.assertQueue(this.portalConversationQueue, { durable: true });
                await this.channel.assertQueue(this.portalOrderStatusQueue, { durable: true });
                await this.channel.assertQueue(this.deliveryRealtimeQueue, { durable: true });
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

    async publishPortalConversationInput(payload: Record<string, unknown>) {
        await this.publishToQueue(this.portalConversationQueue, payload, 'portal.conversation.input');
    }

    async publishPortalOrderStatus(payload: Record<string, unknown>) {
        await this.publishToQueue(this.portalOrderStatusQueue, payload, 'portal.order.status');
    }

    async publishDeliveryRealtimeEvent(payload: Record<string, unknown>) {
        await this.publishToQueue(this.deliveryRealtimeQueue, payload, String(payload.type || 'delivery.event'));
    }

    async publishDomainOutboxEvent(event: {
        eventId: string;
        eventType: string;
        tenantId: string;
        aggregateId: string;
        occurredAt: Date;
        payload: Record<string, unknown>;
    }) {
        if (!this.channel) await this.connect();
        if (!this.channel) throw new Error('RabbitMQ channel is not available');

        await this.channel.assertExchange(this.eventsExchange, 'topic', { durable: true });
        const payload = {
            ...event.payload,
            version: Number(event.payload.version || 1),
            event_id: event.eventId,
            type: String(event.payload.type || event.eventType),
            event_type: String(event.payload.event_type || event.eventType),
            tenant_id: String(event.payload.tenant_id || event.tenantId),
            aggregate_id: String(event.payload.aggregate_id || event.aggregateId),
            occurred_at: event.payload.occurred_at || event.occurredAt.toISOString(),
        };
        const routingKey = fulfillmentEventTypes.has(event.eventType)
            ? this.fulfillmentRoutingKey
            : this.domainRoutingKey;
        const published = this.channel.publish(this.eventsExchange, routingKey, Buffer.from(JSON.stringify(payload)), {
            contentType: 'application/json',
            persistent: true,
            type: event.eventType,
            messageId: event.eventId,
            timestamp: Date.now(),
            headers: {
                tenant_id: event.tenantId,
                aggregate_id: event.aggregateId,
                event_id: event.eventId,
            },
        });
        if (!published) throw new Error('RabbitMQ write buffer is full');
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

const fulfillmentEventTypes = new Set([
    'delivery.quote_created.v1',
    'delivery.provider_attempt_failed.v1',
    'delivery.provider_assigned.v1',
    'delivery.provider_cycle_exhausted.v1',
    'delivery.tracking_available.v1',
    'delivery.fulfillment_changed.v1',
    'delivery.completed.v1',
]);

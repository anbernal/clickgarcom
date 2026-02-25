import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { connect } from 'amqplib';

@Injectable()
export class AmqpService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AmqpService.name);
    private connection: any = null;
    private channel: any = null;
    private readonly url = process.env.RABBITMQ_URL || 'amqp://clickgarcom:clickgarcom123@localhost:5672/';
    private readonly queueName = 'admin.table.events';

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
                await this.channel.assertQueue(this.queueName, { durable: true });
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
        if (!this.channel) {
            await this.connect();
        }

        if (!this.channel) {
            throw new Error('RabbitMQ channel is not available');
        }

        const payload = Buffer.from(
            JSON.stringify({
                request_id: requestId,
                action,
            }),
        );

        this.channel.sendToQueue(this.queueName, payload, {
            contentType: 'application/json',
            persistent: true,
            type: 'admin.table.event',
            timestamp: Date.now(),
        });

        this.logger.debug(`Published table event for request ${requestId} with action ${action}`);
    }
}

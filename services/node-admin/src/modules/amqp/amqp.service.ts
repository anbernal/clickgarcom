import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Connection, Channel, connect } from 'amqplib';

@Injectable()
export class AmqpService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AmqpService.name);
    private connection: any;
    private channel: any;
    private readonly url = process.env.RABBITMQ_URL || 'amqp://clickgarcom:clickgarcom123@localhost:5672/';

    async onModuleInit() {
        await this.connect();
    }

    async onModuleDestroy() {
        if (this.channel) {
            await this.channel.close();
        }
        if (this.connection) {
            await this.connection.close();
        }
    }

    private async connect() {
        this.logger.log('[Mocked] RabbitMQ connection bypassed for local SQLite dev environment');
    }

    async publishTableEvent(requestId: string, action: 'APPROVE' | 'REJECT') {
        this.logger.debug(`[Mocked] Published table event for request ${requestId} with action ${action} `);
    }
}

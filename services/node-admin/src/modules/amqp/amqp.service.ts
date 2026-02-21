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
        try {
            this.connection = await connect(this.url);
            this.channel = await this.connection.createChannel();

            // Declarar o exchange (fanout, topic ou direct dependendo de como o Go lê)
            // O Go-core lê de amqp.ExchangeDeclare...
            // Para manter simples, vamos publicar diretamente na fila que o Go consome: "admin.table.events"
            await this.channel.assertQueue('admin.table.events', { durable: true });

            this.logger.log('Connected to RabbitMQ successfully');
        } catch (error) {
            this.logger.error(`Failed to connect to RabbitMQ: ${error.message} `);
            // Tentativa de reconexão simples após 5s se falhar
            setTimeout(() => this.connect(), 5000);
        }
    }

    async publishTableEvent(requestId: string, action: 'APPROVE' | 'REJECT') {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not connected');
        }

        const payload = {
            request_id: requestId,
            action: action,
        };

        const buffer = Buffer.from(JSON.stringify(payload));
        const success = this.channel.sendToQueue('admin.table.events', buffer, {
            persistent: true,
            contentType: 'application/json',
        });

        if (success) {
            this.logger.debug(`Published table event for request ${requestId} with action ${action} `);
        } else {
            this.logger.error('Failed to publish table event to queue');
        }
    }
}

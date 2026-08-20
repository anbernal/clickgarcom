import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';

import { Delivery } from '../../entities/delivery.entity';
import { Customer } from '../../entities/customer.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DEFAULT_MESSAGE_TEMPLATES, resolveMessageTemplate } from '../../shared/message-templates';

export enum DeliveryNotificationMilestone {
    Preparing = 'PREPARING',
    InTransit = 'IN_TRANSIT',
    Delivered = 'DELIVERED',
    Rejected = 'REJECTED',
    CycleExhausted = 'CYCLE_EXHAUSTED',
}

export type DeliveryNotificationRequest = {
    tenantId: string;
    deliveryId: string;
    recipient: string;
    milestone: DeliveryNotificationMilestone;
    body: string;
    templateId: string;
    button?: {
        text: string;
        url: string;
    };
};

// UUID namespace dedicated to notification idempotency. The generated UUID is
// used as outbox_messages.id, so duplicate events conflict atomically.
const DELIVERY_NOTIFICATION_NAMESPACE = 'f4d0e4b5-0b31-5d27-8e63-54caefb53e6e';

@Injectable()
export class DeliveryNotificationService {
    /**
     * Customer communication is intentionally restricted to the essential
     * delivery milestones. External provider tracking remains available to
     * the customer in the web flow, not as a stream of WhatsApp messages.
     */
    async enqueuePickup(
        manager: EntityManager,
        delivery: Delivery,
        trackingUrl: string,
        pin: string,
    ): Promise<void> {
        if (!delivery.customerPhone) return;
        const body = await this.resolveBody(manager, delivery, DeliveryNotificationMilestone.InTransit, {
            '{codigo_pedido}': delivery.displayCode,
            '{codigo_entrega}': pin,
        });
        const bodyWithCode = body.includes(pin)
            ? body
            : `${body}\n\n🔐 Código para confirmar o recebimento: *${pin}*\nInforme este código somente quando estiver com o pedido.`;
        await this.enqueue(manager, {
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            recipient: delivery.customerPhone,
            milestone: DeliveryNotificationMilestone.InTransit,
            body: bodyWithCode,
            templateId: 'delivery_in_transit_confirm_v1',
            button: trackingUrl ? { text: 'Finalizar entrega', url: trackingUrl } : undefined,
        });
    }

    async enqueueExternalAssignment(
        manager: EntityManager,
        delivery: Delivery,
        trackingUrl: string | null,
        confirmationCode: string | null,
    ): Promise<void> {
        // Deliberately no WhatsApp message: assignment/tracking data is an
        // internal operational detail and is not part of the customer flow.
        void manager;
        void delivery;
        void trackingUrl;
        void confirmationCode;
    }

    async enqueueMilestone(
        manager: EntityManager,
        delivery: Delivery,
        milestone: DeliveryNotificationMilestone,
    ): Promise<void> {
        if (!delivery.customerPhone) return;
        const body = await this.resolveBody(manager, delivery, milestone, {
            '{codigo_pedido}': delivery.displayCode,
            '{previsao_minutos}': String(Math.max(1, Math.round(Number(delivery.etaSeconds || 0) / 60)) || 10),
        });
        await this.enqueue(manager, {
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            recipient: delivery.customerPhone,
            milestone,
            body,
            templateId: `delivery_${milestone.toLowerCase()}_v1`,
        });
    }

    private async resolveBody(
        manager: EntityManager,
        delivery: Delivery,
        milestone: DeliveryNotificationMilestone,
        replacements: Record<string, string>,
    ): Promise<string> {
        const tenant = await manager.getRepository(Tenant).findOne({ where: { id: delivery.tenantId } });
        const templates = tenant?.settings?.messages || {};
        const customerName = await this.customerName(manager, delivery);
        const templateReplacements = {
            ...replacements,
            '{nome_cliente}': customerName,
            '{nome_restaurante}': String(tenant?.name || 'Restaurante').trim() || 'Restaurante',
        };
        const templateByMilestone: Record<DeliveryNotificationMilestone, keyof typeof DEFAULT_MESSAGE_TEMPLATES> = {
            [DeliveryNotificationMilestone.Preparing]: 'msg_delivery_preparing',
            [DeliveryNotificationMilestone.InTransit]: 'msg_delivery_in_transit',
            [DeliveryNotificationMilestone.Delivered]: 'msg_delivery_delivered',
            [DeliveryNotificationMilestone.Rejected]: 'msg_delivery_rejected',
            [DeliveryNotificationMilestone.CycleExhausted]: 'msg_delivery_cycle_exhausted',
        };
        const key = templateByMilestone[milestone];
        const body = resolveMessageTemplate(templates[key], DEFAULT_MESSAGE_TEMPLATES[key], templateReplacements)
            .replace(/(^|\n)(\s*[^\p{L}\p{N}\n]{0,4}\s*)Cliente(?=\s*,)/iu, (_match, lineStart, prefix) => `${lineStart}${prefix}${customerName}`);
        // Tenant-specific legacy templates may not yet use {nome_cliente}.
        // Prefix only Delivery messages so the customer's name is still present
        // without changing the dine-in message templates.
        return body.toLocaleLowerCase('pt-BR').includes(customerName.toLocaleLowerCase('pt-BR'))
            ? body
            : `${customerName},\n\n${body}`;
    }

    private async customerName(manager: EntityManager, delivery: Delivery): Promise<string> {
        const snapshotName = this.normalizeCustomerName(delivery.customerName);
        if (snapshotName) return snapshotName;
        const repository = manager.getRepository(Customer);
        const customer = delivery.customerId
            ? await repository.findOne({ where: { id: delivery.customerId, tenantId: delivery.tenantId } })
            : delivery.customerPhone
                ? await repository.findOne({ where: { tenantId: delivery.tenantId, phoneNormalized: String(delivery.customerPhone).replace(/\D/g, '') } })
                : null;
        return this.normalizeCustomerName(customer?.name) || 'Cliente';
    }

    private normalizeCustomerName(value: unknown): string {
        const name = String(value || '').trim().replace(/\s+/g, ' ');
        if (!name || ['<nil>', 'nil', 'null', 'cliente'].includes(name.toLocaleLowerCase('pt-BR'))) return '';
        return name.slice(0, 120);
    }

    async enqueue(manager: EntityManager, request: DeliveryNotificationRequest): Promise<void> {
        const notificationKey = `${request.tenantId}:${request.deliveryId}:${request.milestone}:v1`;
        const id = uuidv5(notificationKey, DELIVERY_NOTIFICATION_NAMESPACE);
        // Payload is the existing WhatsApp outbox contract. It is never logged
        // by this service; Core Go redacts PIN-shaped values from message logs.
        const payload = request.button
            ? JSON.stringify({ type: 'url_button', body: request.body, button_text: request.button.text, url: request.button.url })
            : request.body;
        await manager.query(
            `INSERT INTO outbox_messages
                (id, tenant_id, destination, recipient, payload, template_id, sent, attempts, max_attempts, created_at)
             VALUES ($1, $2, 'whatsapp', $3, $4, $5, false, 0, 3, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [id, request.tenantId, request.recipient, payload, request.templateId],
        );
    }
}

import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';

import { Delivery } from '../../entities/delivery.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DEFAULT_MESSAGE_TEMPLATES, resolveMessageTemplate } from '../../shared/message-templates';

export enum DeliveryNotificationMilestone {
    Accepted = 'ACCEPTED',
    ManualAcceptanceRequired = 'MANUAL_ACCEPTANCE_REQUIRED',
    ExternalAssigned = 'EXTERNAL_ASSIGNED',
    PickedUp = 'PICKED_UP',
    Arrived = 'ARRIVED',
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
};

// UUID namespace dedicated to notification idempotency. The generated UUID is
// used as outbox_messages.id, so duplicate events conflict atomically.
const DELIVERY_NOTIFICATION_NAMESPACE = 'f4d0e4b5-0b31-5d27-8e63-54caefb53e6e';

@Injectable()
export class DeliveryNotificationService {
    async enqueuePickup(
        manager: EntityManager,
        delivery: Delivery,
        trackingUrl: string,
        pin: string,
    ): Promise<void> {
        if (!delivery.customerPhone) return;
        const body = await this.resolveBody(manager, delivery, DeliveryNotificationMilestone.PickedUp, {
            '{codigo_pedido}': delivery.displayCode,
            '{link_rastreamento}': trackingUrl,
            '{pin_entrega}': pin,
        });
        await this.enqueue(manager, {
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            recipient: delivery.customerPhone,
            milestone: DeliveryNotificationMilestone.PickedUp,
            body,
            templateId: 'delivery_picked_up_v1',
        });
    }

    /**
     * Notifies the customer with the operator's tracking URL/code. This is
     * deliberately separate from enqueuePickup: OWN deliveries must never
     * call this path or create an internal PIN challenge.
     */
    async enqueueExternalAssignment(
        manager: EntityManager,
        delivery: Delivery,
        trackingUrl: string | null,
        confirmationCode: string | null,
    ): Promise<void> {
        if (!delivery.customerPhone || (!trackingUrl && !confirmationCode)) return;
        const body = await this.resolveBody(manager, delivery, DeliveryNotificationMilestone.ExternalAssigned, {
            '{codigo_pedido}': delivery.displayCode,
            '{link_rastreamento}': trackingUrl || 'Disponível no aplicativo do operador',
            '{codigo_operador}': confirmationCode || 'Não informado pelo operador',
        });
        await this.enqueue(manager, {
            tenantId: delivery.tenantId,
            deliveryId: delivery.id,
            recipient: delivery.customerPhone,
            milestone: DeliveryNotificationMilestone.ExternalAssigned,
            body,
            templateId: 'delivery_external_assigned_v1',
        });
    }

    async enqueueMilestone(
        manager: EntityManager,
        delivery: Delivery,
        milestone: DeliveryNotificationMilestone,
    ): Promise<void> {
        if (!delivery.customerPhone || milestone === DeliveryNotificationMilestone.PickedUp) return;
        const body = await this.resolveBody(manager, delivery, milestone, {
            '{codigo_pedido}': delivery.displayCode,
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
        const templateByMilestone: Record<DeliveryNotificationMilestone, keyof typeof DEFAULT_MESSAGE_TEMPLATES> = {
            [DeliveryNotificationMilestone.Accepted]: 'msg_delivery_accepted',
            [DeliveryNotificationMilestone.ManualAcceptanceRequired]: 'msg_delivery_manual_acceptance',
            [DeliveryNotificationMilestone.ExternalAssigned]: 'msg_delivery_external_assigned',
            [DeliveryNotificationMilestone.PickedUp]: 'msg_delivery_picked_up',
            [DeliveryNotificationMilestone.Arrived]: 'msg_delivery_arrived',
            [DeliveryNotificationMilestone.Delivered]: 'msg_delivery_delivered',
            [DeliveryNotificationMilestone.Rejected]: 'msg_delivery_rejected',
            [DeliveryNotificationMilestone.CycleExhausted]: 'msg_delivery_cycle_exhausted',
        };
        const key = templateByMilestone[milestone];
        return resolveMessageTemplate(templates[key], DEFAULT_MESSAGE_TEMPLATES[key], replacements);
    }

    async enqueue(manager: EntityManager, request: DeliveryNotificationRequest): Promise<void> {
        const notificationKey = `${request.tenantId}:${request.deliveryId}:${request.milestone}:v1`;
        const id = uuidv5(notificationKey, DELIVERY_NOTIFICATION_NAMESPACE);
        // Payload is the existing WhatsApp outbox contract. It is never logged
        // by this service; Core Go redacts PIN-shaped values from message logs.
        await manager.query(
            `INSERT INTO outbox_messages
                (id, tenant_id, destination, recipient, payload, template_id, sent, attempts, max_attempts, created_at)
             VALUES ($1, $2, 'whatsapp', $3, $4, $5, false, 0, 3, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [id, request.tenantId, request.recipient, request.body, request.templateId],
        );
    }
}

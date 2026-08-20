import { Delivery } from '../../entities/delivery.entity';
import {
    DeliveryNotificationMilestone,
    DeliveryNotificationService,
} from './delivery-notification.service';

describe('DeliveryNotificationService', () => {
    it('uses a deterministic outbox id for duplicate milestones', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1 });
        const manager = {
            query,
            getRepository: () => ({ findOne: jest.fn().mockResolvedValue(null) }),
        } as any;
        const service = new DeliveryNotificationService();
        const delivery = Object.assign(new Delivery(), {
            id: '3a5f77f3-a7c1-47a5-91f0-1d2a7b97809c',
            tenantId: '842c4a5a-29b3-4930-a7d4-2f8ce433b90e',
            customerPhone: '5511999999999',
            displayCode: '123456',
        });

        await service.enqueueMilestone(manager, delivery, DeliveryNotificationMilestone.Delivered);
        await service.enqueueMilestone(manager, delivery, DeliveryNotificationMilestone.Delivered);

        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][1][0]).toBe(query.mock.calls[1][1][0]);
        expect(query.mock.calls[0][0]).toContain('ON CONFLICT (id) DO NOTHING');
    });

    it('enqueues the preparation notification when the restaurant accepts the delivery', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1 });
        const manager = {
            query,
            getRepository: () => ({ findOne: jest.fn().mockResolvedValue({ settings: { messages: {} } }) }),
        } as any;
        const service = new DeliveryNotificationService();
        const delivery = Object.assign(new Delivery(), {
            id: '3a5f77f3-a7c1-47a5-91f0-1d2a7b97809c',
            tenantId: '842c4a5a-29b3-4930-a7d4-2f8ce433b90e',
            customerPhone: '5511999999999',
            customerName: 'Mariana',
            displayCode: '123456',
            etaSeconds: 900,
        });

        await service.enqueueMilestone(manager, delivery, DeliveryNotificationMilestone.Preparing);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][1][4]).toBe('delivery_preparing_v1');
        expect(query.mock.calls[0][1][3]).toContain('seu pedido *123456* foi aceito');
        expect(query.mock.calls[0][1][3]).toContain('15 minutos');
    });

    it('does not enqueue a message without a customer phone', async () => {
        const query = jest.fn();
        const service = new DeliveryNotificationService();
        await service.enqueueMilestone({ query, getRepository: () => ({ findOne: jest.fn().mockResolvedValue(null) }) } as any, Object.assign(new Delivery(), {
            id: '3a5f77f3-a7c1-47a5-91f0-1d2a7b97809c',
            tenantId: '842c4a5a-29b3-4930-a7d4-2f8ce433b90e',
            customerPhone: null,
            displayCode: '123456',
        }), DeliveryNotificationMilestone.Delivered);
        expect(query).not.toHaveBeenCalled();
    });

    it('uses the cycle exhausted milestone and deterministic key', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1 });
        const manager = {
            query,
            getRepository: () => ({
                findOne: jest.fn().mockResolvedValue({ settings: { messages: {} } }),
            }),
        } as any;
        const service = new DeliveryNotificationService();
        const delivery = Object.assign(new Delivery(), {
            id: '3a5f77f3-a7c1-47a5-91f0-1d2a7b97809c',
            tenantId: '842c4a5a-29b3-4930-a7d4-2f8ce433b90e',
            customerPhone: '5511999999999',
            displayCode: '123456',
        });

        await service.enqueueMilestone(manager, delivery, DeliveryNotificationMilestone.CycleExhausted);
        await service.enqueueMilestone(manager, delivery, DeliveryNotificationMilestone.CycleExhausted);

        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][1][0]).toBe(query.mock.calls[1][1][0]);
        expect(query.mock.calls[0][1][4]).toBe('delivery_cycle_exhausted_v1');
        expect(String(query.mock.calls[0][1][3])).not.toContain('5511999999999');
    });

    it('sends external operator code only through the notification outbox', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1 });
        const manager = {
            query,
            getRepository: () => ({ findOne: jest.fn().mockResolvedValue({ settings: { messages: {} } }) }),
        } as any;
        const service = new DeliveryNotificationService();
        const delivery = Object.assign(new Delivery(), {
            id: '3a5f77f3-a7c1-47a5-91f0-1d2a7b97809c',
            tenantId: '842c4a5a-29b3-4930-a7d4-2f8ce433b90e',
            customerPhone: '5511999999999',
            displayCode: '123456',
        });

        await service.enqueueExternalAssignment(manager, delivery, 'https://tracking.invalid/abc', '987654');

        expect(query).toHaveBeenCalledTimes(1);
        const payload = query.mock.calls[0][1];
        expect(payload[4]).toContain('https://tracking.invalid/abc');
        expect(payload[4]).toContain('987654');
        expect(payload[5]).toBe('delivery_external_assigned_v1');
    });

    it('does not enqueue external assignment without provider data', async () => {
        const query = jest.fn();
        const service = new DeliveryNotificationService();
        await service.enqueueExternalAssignment({ query, getRepository: () => ({ findOne: jest.fn() }) } as any, Object.assign(new Delivery(), {
            id: '3a5f77f3-a7c1-47a5-91f0-1d2a7b97809c',
            tenantId: '842c4a5a-29b3-4930-a7d4-2f8ce433b90e',
            customerPhone: '5511999999999',
            displayCode: '123456',
        }), null, null);
        expect(query).not.toHaveBeenCalled();
    });
});

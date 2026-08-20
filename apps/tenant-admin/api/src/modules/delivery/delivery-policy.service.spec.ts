import { DeliveryPolicyService } from './delivery-policy.service';

describe('DeliveryPolicyService', () => {
    const service = new DeliveryPolicyService();

    const baseSettings = {
        enabled: true,
        timezone: 'America/Sao_Paulo',
        auto_accept: {
            enabled: true,
            require_confirmed_payment: true,
            max_active_deliveries: 8,
            preparation_minutes: 30,
            windows: [{ days: ['THU' as const], start: '18:00', end: '23:00' }],
        },
    };

    const baseInput = {
        now: new Date('2026-08-06T21:00:00.000Z'),
        tenantIsActive: true,
        tenantIsOpen: true,
        addressConfirmed: true,
        insideServiceArea: true,
        itemsAvailable: true,
        paymentConfirmed: true,
        activeDeliveries: 0,
        manuallyBlocked: false,
    };

    it('accepts an eligible order using the tenant timezone', () => {
        const decision = service.decide(baseSettings, baseInput);

        expect(decision.result).toBe('AUTO_ACCEPTED');
        expect(decision.reasonCode).toBe('ALL_RULES_MATCHED');
        expect(decision.localDateTime).toBe('2026-08-06T18:00:00');
    });

    it('requires manual acceptance outside the configured window', () => {
        const decision = service.decide(baseSettings, {
            ...baseInput,
            now: new Date('2026-08-07T21:00:00.000Z'),
        });

        expect(decision.result).toBe('MANUAL_REQUIRED');
        expect(decision.reasonCode).toBe('OUTSIDE_ACCEPTANCE_WINDOW');
    });

    it('supports windows crossing midnight', () => {
        const settings = {
            ...baseSettings,
            auto_accept: {
                ...baseSettings.auto_accept,
                windows: [{ days: ['THU' as const], start: '22:00', end: '02:00' }],
            },
        };

        expect(service.isWithinWindow(settings.auto_accept.windows, { weekday: 'THU', minutes: 23 * 60 })).toBe(true);
        expect(service.isWithinWindow(settings.auto_accept.windows, { weekday: 'THU', minutes: 1 * 60 })).toBe(true);
        expect(service.isWithinWindow(settings.auto_accept.windows, { weekday: 'THU', minutes: 3 * 60 })).toBe(false);
    });

    it('does not allow overlapping windows', () => {
        expect(() => service.validateSettings({
            ...baseSettings,
            auto_accept: {
                ...baseSettings.auto_accept,
                windows: [
                    { days: ['THU'], start: '18:00', end: '20:00' },
                    { days: ['THU'], start: '19:00', end: '21:00' },
                ],
            },
        })).toThrow('não podem se sobrepor');
    });

    it('fails closed when payment or capacity is not eligible', () => {
        const payment = service.decide(baseSettings, { ...baseInput, paymentConfirmed: false });
        const capacity = service.decide(baseSettings, { ...baseInput, activeDeliveries: 8 });

        expect(payment.reasonCode).toBe('PAYMENT_NOT_CONFIRMED');
        expect(capacity.reasonCode).toBe('ACTIVE_DELIVERY_CAPACITY_EXCEEDED');
    });
});

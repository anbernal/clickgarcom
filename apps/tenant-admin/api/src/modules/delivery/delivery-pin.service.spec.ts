import {
    buildDeliveryPinDigest,
    generateDeliveryPin,
    safeCompareDeliveryPinDigest,
} from './delivery-pin.service';

describe('DeliveryPinService cryptographic foundation', () => {
    it('generates a four-character hexadecimal code including leading zeroes', () => {
        for (let index = 0; index < 100; index += 1) {
            expect(generateDeliveryPin()).toMatch(/^[0-9A-F]{4}$/);
        }
    });

    it('uses tenant and delivery scope in the HMAC digest', () => {
        const digest = buildDeliveryPinDigest('test-secret', 'v1', 'tenant-a', 'delivery-a', '012345');
        expect(digest).toHaveLength(64);
        expect(safeCompareDeliveryPinDigest(digest, digest)).toBe(true);
        expect(safeCompareDeliveryPinDigest(
            digest,
            buildDeliveryPinDigest('test-secret', 'v1', 'tenant-b', 'delivery-a', '012345'),
        )).toBe(false);
        expect(safeCompareDeliveryPinDigest(
            digest,
            buildDeliveryPinDigest('test-secret', 'v1', 'tenant-a', 'delivery-a', '012346'),
        )).toBe(false);
    });

    it('rejects malformed digest lengths without invoking timingSafeEqual', () => {
        expect(safeCompareDeliveryPinDigest('aa', 'bbbb')).toBe(false);
        expect(safeCompareDeliveryPinDigest('', '')).toBe(false);
    });
});

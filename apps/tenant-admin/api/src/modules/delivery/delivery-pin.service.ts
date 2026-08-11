import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { DeliveryPinChallenge } from '../../entities/delivery-pin-challenge.entity';

export type DeliveryPinFailure = 'MISSING' | 'EXPIRED' | 'INVALID' | 'LOCKED';

export type DeliveryPinVerification =
    | { valid: true; challenge: DeliveryPinChallenge }
    | { valid: false; failure: DeliveryPinFailure };

export type IssuedDeliveryPin = {
    challenge: DeliveryPinChallenge;
    /** One-time value for the notification pipeline; never return from HTTP. */
    pin: string;
};

export function generateDeliveryPin(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function buildDeliveryPinDigest(secret: string, secretVersion: string, tenantId: string, deliveryId: string, pin: string): string {
    return createHmac('sha256', secret)
        .update(`delivery-pin:${secretVersion}:${tenantId}:${deliveryId}:${pin}`)
        .digest('hex');
}

export function safeCompareDeliveryPinDigest(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(actualHex, 'hex');
    return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

/** Persistence and cryptographic rules for the six-digit delivery PIN. */
@Injectable()
export class DeliveryPinService {
    constructor(private readonly configService: ConfigService) { }

    async issueChallenge(manager: EntityManager, tenantId: string, deliveryId: string): Promise<IssuedDeliveryPin> {
        const repository = manager.getRepository(DeliveryPinChallenge);
        const now = new Date();
        const active = await repository
            .createQueryBuilder('challenge')
            .where('challenge.tenant_id = :tenantId', { tenantId })
            .andWhere('challenge.delivery_id = :deliveryId', { deliveryId })
            .andWhere('challenge.replaced_at IS NULL')
            .andWhere('challenge.verified_at IS NULL')
            .orderBy('challenge.issued_at', 'DESC')
            .setLock('pessimistic_write')
            .getOne();
        if (active) {
            active.replacedAt = now;
            await repository.save(active);
        }

        const pin = generateDeliveryPin();
        const secretVersion = this.secretVersion();
        const challenge = repository.create({
            tenantId,
            deliveryId,
            pinDigest: this.digest(tenantId, deliveryId, pin, secretVersion),
            secretVersion,
            attemptCount: 0,
            maxAttempts: this.maxAttempts(),
            lockedUntil: null,
            issuedAt: now,
            expiresAt: new Date(now.getTime() + this.ttlMinutes() * 60_000),
            verifiedAt: null,
            lastAttemptAt: null,
            replacedAt: null,
        });
        await repository.save(challenge);
        return { challenge, pin };
    }

    /**
     * Verifies and updates a challenge under the caller's transaction. Invalid
     * attempts are returned as a result (rather than thrown) so the caller can
     * commit the increment/lock before converting it to an HTTP error.
     */
    async verifyChallenge(
        manager: EntityManager,
        tenantId: string,
        deliveryId: string,
        pin: string,
    ): Promise<DeliveryPinVerification> {
        const repository = manager.getRepository(DeliveryPinChallenge);
        const challenge = await repository
            .createQueryBuilder('challenge')
            .where('challenge.tenant_id = :tenantId', { tenantId })
            .andWhere('challenge.delivery_id = :deliveryId', { deliveryId })
            .andWhere('challenge.replaced_at IS NULL')
            .andWhere('challenge.verified_at IS NULL')
            .orderBy('challenge.issued_at', 'DESC')
            .setLock('pessimistic_write')
            .getOne();

        if (!challenge) return { valid: false, failure: 'MISSING' };

        const now = new Date();
        if (challenge.expiresAt.getTime() <= now.getTime()) {
            challenge.replacedAt = now;
            await repository.save(challenge);
            return { valid: false, failure: 'EXPIRED' };
        }

        if ((challenge.lockedUntil && challenge.lockedUntil.getTime() > now.getTime())
            || challenge.attemptCount >= challenge.maxAttempts) {
            return { valid: false, failure: 'LOCKED' };
        }

        const digest = this.digest(tenantId, deliveryId, pin, challenge.secretVersion);
        if (!safeCompareDeliveryPinDigest(challenge.pinDigest, digest)) {
            challenge.attemptCount += 1;
            challenge.lastAttemptAt = now;
            if (challenge.attemptCount >= challenge.maxAttempts) {
                challenge.lockedUntil = new Date(now.getTime() + this.lockMinutes() * 60_000);
            }
            await repository.save(challenge);
            return {
                valid: false,
                failure: challenge.lockedUntil ? 'LOCKED' : 'INVALID',
            };
        }

        challenge.verifiedAt = now;
        challenge.lastAttemptAt = now;
        await repository.save(challenge);
        return { valid: true, challenge };
    }

    /** Fingerprint used for idempotency without persisting the PIN itself. */
    fingerprint(pin: string): string {
        return createHmac('sha256', this.secret()).update(`delivery-pin-idempotency:${pin}`).digest('hex');
    }

    private digest(tenantId: string, deliveryId: string, pin: string, secretVersion: string): string {
        return buildDeliveryPinDigest(this.secret(), secretVersion, tenantId, deliveryId, pin);
    }

    private secret(): string {
        const secret = this.configService.get<string>('DELIVERY_PIN_SECRET')
            || this.configService.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) {
            throw new Error('DELIVERY_PIN_SECRET or JWT_SECRET with at least 32 characters is required');
        }
        return secret;
    }

    private secretVersion(): string {
        return this.configService.get<string>('DELIVERY_PIN_SECRET_VERSION') || 'v1';
    }

    private ttlMinutes(): number {
        return this.clampedConfigNumber('DELIVERY_PIN_TTL_MINUTES', 30, 5, 120);
    }

    private lockMinutes(): number {
        return this.clampedConfigNumber('DELIVERY_PIN_LOCK_MINUTES', 15, 1, 120);
    }

    private maxAttempts(): number {
        return this.clampedConfigNumber('DELIVERY_PIN_MAX_ATTEMPTS', 5, 1, 10);
    }

    private clampedConfigNumber(name: string, fallback: number, min: number, max: number): number {
        const configured = Number(this.configService.get<string | number>(name));
        if (!Number.isFinite(configured)) return fallback;
        return Math.max(min, Math.min(max, Math.trunc(configured)));
    }
}

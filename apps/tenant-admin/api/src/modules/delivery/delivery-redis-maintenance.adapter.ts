import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { DeliveryRedisMaintenance } from './delivery-maintenance.service';

@Injectable()
export class DeliveryRedisMaintenanceAdapter implements DeliveryRedisMaintenance {
    private readonly endpoint: string;
    private readonly token: string;

    constructor(config: ConfigService) {
        this.endpoint = String(config.get('DELIVERY_REDIS_MAINTENANCE_URL') || '').trim();
        this.token = String(config.get('INTERNAL_SERVICE_TOKEN') || '').trim();
    }

    async deleteTerminalDeliveryKeys(tenantId?: string): Promise<number> {
        if (!this.endpoint) throw new Error('DELIVERY_REDIS_MAINTENANCE_URL is not configured');
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(this.token ? { 'x-internal-token': this.token } : {}),
            },
            body: JSON.stringify({ tenant_id: tenantId || undefined }),
        });
        if (!response.ok) throw new Error(`redis maintenance returned HTTP ${response.status}`);
        const body = await response.json() as { removed?: number };
        return Number(body.removed || 0);
    }
}

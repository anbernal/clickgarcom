import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
    DeliveryGeocodeRequest,
    DeliveryGeocodeResult,
    DeliveryMapsProvider,
    DeliveryRouteRequest,
    DeliveryRouteResult,
} from './maps-provider';

/**
 * Provider-neutral HTTP adapter. The external service contract is deliberately
 * small so a tenant deployment can use Google, Mapbox, Here, or an internal
 * proxy without leaking credentials into delivery payloads.
 */
@Injectable()
export class HttpDeliveryMapsProvider implements DeliveryMapsProvider {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly timeoutMs: number;
    private readonly geocodePath: string;
    private readonly routePath: string;

    constructor(config: ConfigService) {
        this.baseUrl = String(config.get('DELIVERY_MAPS_BASE_URL') || '').replace(/\/$/, '');
        this.apiKey = String(config.get('DELIVERY_MAPS_API_KEY') || '');
        this.timeoutMs = Math.max(500, Math.min(10_000, Number(config.get('DELIVERY_MAPS_TIMEOUT_MS') || 5000)));
        this.geocodePath = String(config.get('DELIVERY_MAPS_GEOCODE_PATH') || '/geocode');
        this.routePath = String(config.get('DELIVERY_MAPS_ROUTE_PATH') || '/route');
    }

    async geocode(input: DeliveryGeocodeRequest): Promise<DeliveryGeocodeResult> {
        const result = await this.request(this.geocodePath, input);
        const lat = Number(result.lat ?? result.latitude);
        const lng = Number(result.lng ?? result.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('maps provider returned invalid geocode');
        return {
            lat,
            lng,
            provider: String(result.provider || 'HTTP'),
            provider_id: result.provider_id ? String(result.provider_id) : undefined,
            quality: this.normalizeQuality(result.quality),
        };
    }

    async route(input: DeliveryRouteRequest): Promise<DeliveryRouteResult> {
        const result = await this.request(this.routePath, input);
        const distance = Number(result.distance_meters ?? result.distance);
        const duration = Number(result.duration_seconds ?? result.duration);
        if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(duration) || duration < 0) {
            throw new Error('maps provider returned invalid route');
        }
        return {
            distance_meters: Math.round(distance),
            duration_seconds: Math.round(duration),
            polyline: result.polyline ? String(result.polyline) : undefined,
            provider: String(result.provider || 'HTTP'),
        };
    }

    private async request(path: string, payload: Record<string, unknown>) {
        if (!this.baseUrl) throw new Error('delivery maps provider is not configured');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`maps provider returned HTTP ${response.status}`);
            const body = await response.json() as unknown;
            if (!body || typeof body !== 'object') throw new Error('maps provider returned invalid payload');
            return body as Record<string, unknown>;
        } finally {
            clearTimeout(timer);
        }
    }

    private normalizeQuality(value: unknown): DeliveryGeocodeResult['quality'] {
        const quality = String(value || 'APPROXIMATE').toUpperCase();
        if (['ROOFTOP', 'RANGE', 'INTERPOLATED', 'APPROXIMATE', 'AMBIGUOUS'].includes(quality)) {
            return quality as DeliveryGeocodeResult['quality'];
        }
        return 'APPROXIMATE';
    }
}

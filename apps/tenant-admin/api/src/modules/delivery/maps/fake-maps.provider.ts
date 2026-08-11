import { Injectable } from '@nestjs/common';
import {
    DeliveryGeocodeRequest,
    DeliveryGeocodeResult,
    DeliveryMapsProvider,
    DeliveryRouteRequest,
    DeliveryRouteResult,
} from './maps-provider';

/** Deterministic provider for local/demo/test environments. */
@Injectable()
export class FakeDeliveryMapsProvider implements DeliveryMapsProvider {
    async geocode(input: DeliveryGeocodeRequest): Promise<DeliveryGeocodeResult> {
        const key = `${input.postal_code || ''}|${input.street || ''}|${input.address_number || ''}`;
        let hash = 0;
        for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return {
            lat: -23.55 + (hash % 1000) / 100000,
            lng: -46.63 + ((hash >>> 10) % 1000) / 100000,
            provider: 'FAKE',
            provider_id: `fake:${hash}`,
            quality: 'APPROXIMATE',
        };
    }

    async route(input: DeliveryRouteRequest): Promise<DeliveryRouteResult> {
        const distance = haversine(input.origin.lat, input.origin.lng, input.destination.lat, input.destination.lng);
        return {
            distance_meters: distance,
            duration_seconds: Math.max(60, Math.round(distance / 8)),
            provider: 'FAKE',
        };
    }
}

function haversine(originLat: number, originLng: number, destinationLat: number, destinationLng: number): number {
    const radius = 6371000;
    const radians = (value: number) => value * Math.PI / 180;
    const deltaLat = radians(destinationLat - originLat);
    const deltaLng = radians(destinationLng - originLng);
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(radians(originLat)) * Math.cos(radians(destinationLat)) * Math.sin(deltaLng / 2) ** 2;
    return Math.round(2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}


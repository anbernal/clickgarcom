import { Injectable } from '@nestjs/common';
import {
    DeliveryGeocodeRequest,
    DeliveryGeocodeResult,
    DeliveryMapsProvider,
    DeliveryReverseGeocodeRequest,
    DeliveryReverseGeocodeResult,
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

    async reverseGeocode(input: DeliveryReverseGeocodeRequest): Promise<DeliveryReverseGeocodeResult> {
        const lat = Number(input.lat.toFixed(6));
        const lng = Number(input.lng.toFixed(6));
        const fixture = FAKE_REVERSE_FIXTURES.find((item) =>
            Math.abs(item.lat - lat) <= item.tolerance && Math.abs(item.lng - lng) <= item.tolerance);
        if (fixture) {
            return {
                lat, lng, provider: 'FAKE', provider_id: `fake:reverse:${lat}:${lng}`, quality: 'APPROXIMATE',
                formatted_address: fixture.formatted_address,
                street: fixture.street, address_number: fixture.address_number,
                neighborhood: fixture.neighborhood, city: fixture.city, state: fixture.state,
                postal_code: fixture.postal_code,
            };
        }
        // O fake não possui uma base cartográfica. Para coordenadas sem fixture,
        // não invente um endereço (isso seria mais perigoso que pedir confirmação manual).
        return {
            lat, lng, provider: 'FAKE', provider_id: `fake:reverse:${lat}:${lng}`, quality: 'APPROXIMATE',
            formatted_address: `Coordenadas ${lat}, ${lng} (endereço não disponível no fake)`,
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

type FakeReverseFixture = {
    lat: number;
    lng: number;
    tolerance: number;
    formatted_address: string;
    street: string;
    address_number: string;
    neighborhood: string;
    city: string;
    state: string;
    postal_code?: string;
};

const FAKE_REVERSE_FIXTURES: FakeReverseFixture[] = [
    {
        lat: -23.55052,
        lng: -46.633308,
        tolerance: 0.0002,
        formatted_address: 'Rua Augusta, 120, Consolação, São Paulo - SP, 01311-000',
        street: 'Rua Augusta', address_number: '120', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', postal_code: '01311-000',
    },
    {
        lat: -23.5513,
        lng: -46.8048,
        tolerance: 0.0002,
        formatted_address: 'Rua Achiles Beline, 460, Padroeira, Osasco - SP',
        street: 'Rua Achiles Beline', address_number: '460', neighborhood: 'Padroeira', city: 'Osasco', state: 'SP',
    },
];

function haversine(originLat: number, originLng: number, destinationLat: number, destinationLng: number): number {
    const radius = 6371000;
    const radians = (value: number) => value * Math.PI / 180;
    const deltaLat = radians(destinationLat - originLat);
    const deltaLng = radians(destinationLng - originLng);
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(radians(originLat)) * Math.cos(radians(destinationLat)) * Math.sin(deltaLng / 2) ** 2;
    return Math.round(2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
    DeliveryGeocodeRequest,
    DeliveryGeocodeResult,
    DeliveryMapsProvider,
    DeliveryReverseGeocodeRequest,
    DeliveryReverseGeocodeResult,
    DeliveryRouteRequest,
    DeliveryRouteResult,
} from './maps-provider';

/** Low-volume, user-triggered address lookup. Never use for background/bulk work. */
@Injectable()
export class NominatimDeliveryMapsProvider implements DeliveryMapsProvider {
    private static nextRequestAt = 0;
    private readonly baseUrl: string;
    private readonly userAgent: string;
    private readonly timeoutMs: number;
    private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

    constructor(config: ConfigService) {
        this.baseUrl = String(config.get('DELIVERY_MAPS_NOMINATIM_BASE_URL') || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
        this.userAgent = String(config.get('DELIVERY_MAPS_NOMINATIM_USER_AGENT') || 'ClickGarcom Delivery/1.0 (+https://clickgarcom.servicoswebia.com.br)');
        this.timeoutMs = Math.max(1_000, Math.min(10_000, Number(config.get('DELIVERY_MAPS_TIMEOUT_MS') || 8_000)));
    }

    async geocode(input: DeliveryGeocodeRequest): Promise<DeliveryGeocodeResult> {
        // Brazilian map datasets often do not index the house number/CEP
        // combination even when the street itself is present. Try the exact
        // address first, then progressively broader queries. The resulting
        // range/approximate quality is surfaced to the caller for confirmation.
        const queries = Array.from(new Set([
            input.formatted_address,
            [input.street, input.neighborhood, input.city, input.state].filter(Boolean).join(', '),
            [input.street, input.city, input.state].filter(Boolean).join(', '),
            [input.street, input.state].filter(Boolean).join(', '),
        ].map((value) => value.trim()).filter(Boolean)));

        for (const query of queries) {
            const params = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '1', countrycodes: 'br', q: query });
            const results = await this.request(`/search?${params}`) as Array<Record<string, unknown>>;
            const result = Array.isArray(results) ? results[0] : null;
            const lat = Number(result?.lat);
            const lng = Number(result?.lon);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng, provider: 'OSM_NOMINATIM', provider_id: osmId(result), quality: qualityFor(result) };
            }
        }

        throw new Error('endereço não localizado pelo provedor de mapas');
    }

    async reverseGeocode(input: DeliveryReverseGeocodeRequest): Promise<DeliveryReverseGeocodeResult> {
        const params = new URLSearchParams({
            format: 'jsonv2', lat: String(input.lat), lon: String(input.lng), zoom: '18',
            addressdetails: '1', layer: 'address', 'accept-language': 'pt-BR',
        });
        const result = await this.request(`/reverse?${params}`) as Record<string, unknown>;
        const address = (result.address && typeof result.address === 'object' ? result.address : {}) as Record<string, unknown>;
        const lat = Number(result.lat ?? input.lat);
        const lng = Number(result.lon ?? input.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('provedor de mapas retornou coordenadas inválidas');
        return {
            lat, lng, provider: 'OSM_NOMINATIM', provider_id: osmId(result), quality: qualityFor(result),
            formatted_address: text(result.display_name),
            street: firstText(address, ['road', 'pedestrian', 'residential', 'footway', 'cycleway']),
            address_number: text(address.house_number),
            neighborhood: firstText(address, ['suburb', 'neighbourhood', 'quarter']),
            city: firstText(address, ['city', 'town', 'village', 'municipality', 'city_district']),
            state: brazilianStateCode(text(address.state), text(address['ISO3166-2-lvl4'])),
            postal_code: text(address.postcode),
        };
    }

    async route(input: DeliveryRouteRequest): Promise<DeliveryRouteResult> {
        const distance = haversine(input.origin.lat, input.origin.lng, input.destination.lat, input.destination.lng);
        return { distance_meters: distance, duration_seconds: Math.max(60, Math.round(distance / 8)), provider: 'HAVERSINE' };
    }

    private async request(path: string): Promise<unknown> {
        const cached = this.cache.get(path);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const delay = Math.max(0, NominatimDeliveryMapsProvider.nextRequestAt - Date.now());
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        NominatimDeliveryMapsProvider.nextRequestAt = Date.now() + 1_100;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.baseUrl}${path}`, { headers: { accept: 'application/json', 'user-agent': this.userAgent }, signal: controller.signal });
            if (!response.ok) throw new Error(`provedor de mapas retornou HTTP ${response.status}`);
            const value = await response.json() as unknown;
            this.cache.set(path, { value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
            return value;
        } finally { clearTimeout(timer); }
    }
}

function text(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
}

function firstText(source: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) { const value = text(source[key]); if (value) return value; }
    return undefined;
}

function osmId(result: Record<string, unknown> | null): string | undefined {
    const type = text(result?.osm_type); const id = text(result?.osm_id);
    return type && id ? `${type}:${id}` : undefined;
}

function qualityFor(result: Record<string, unknown> | null): DeliveryGeocodeResult['quality'] {
    const type = String(result?.type || result?.addresstype || '').toLowerCase();
    if (['house', 'building', 'apartments'].includes(type)) return 'ROOFTOP';
    if (['residential', 'tertiary', 'primary', 'secondary', 'road', 'street'].includes(type)) return 'RANGE';
    return 'APPROXIMATE';
}

function brazilianStateCode(state?: string, isoCode?: string): string | undefined {
    const fromIso = String(isoCode || '').match(/^BR-([A-Z]{2})$/i)?.[1];
    if (fromIso) return fromIso.toUpperCase();
    const states: Record<string, string> = {
        'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF',
        'espírito santo': 'ES', 'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
        'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR', 'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
        'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
    };
    return state ? states[state.toLocaleLowerCase('pt-BR')] : undefined;
}

function haversine(originLat: number, originLng: number, destinationLat: number, destinationLng: number): number {
    const radius = 6371000; const radians = (value: number) => value * Math.PI / 180;
    const deltaLat = radians(destinationLat - originLat); const deltaLng = radians(destinationLng - originLng);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(originLat)) * Math.cos(radians(destinationLat)) * Math.sin(deltaLng / 2) ** 2;
    return Math.round(2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

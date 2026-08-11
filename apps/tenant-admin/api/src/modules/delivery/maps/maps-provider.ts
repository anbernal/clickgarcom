export type DeliveryGeocodeRequest = {
    formatted_address: string;
    postal_code?: string;
    street?: string;
    address_number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
};

export type DeliveryGeocodeResult = {
    lat: number;
    lng: number;
    provider: string;
    provider_id?: string;
    quality: 'ROOFTOP' | 'RANGE' | 'INTERPOLATED' | 'APPROXIMATE' | 'AMBIGUOUS';
};

export type DeliveryRouteRequest = {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
};

export type DeliveryRouteResult = {
    distance_meters: number;
    duration_seconds: number;
    polyline?: string;
    provider: string;
};

export interface DeliveryMapsProvider {
    geocode(input: DeliveryGeocodeRequest): Promise<DeliveryGeocodeResult>;
    route(input: DeliveryRouteRequest): Promise<DeliveryRouteResult>;
}

export const DELIVERY_MAPS_PROVIDER = Symbol('DELIVERY_MAPS_PROVIDER');


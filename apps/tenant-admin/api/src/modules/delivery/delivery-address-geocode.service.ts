import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DELIVERY_MAPS_PROVIDER, DeliveryMapsProvider } from './maps/maps-provider';
import { GeocodeDeliveryAddressDto, ReverseGeocodeDeliveryAddressDto } from './dto/delivery-address-geocode.dto';

@Injectable()
export class DeliveryAddressGeocodeService {
    constructor(@Inject(DELIVERY_MAPS_PROVIDER) private readonly mapsProvider: DeliveryMapsProvider) { }

    async geocode(dto: GeocodeDeliveryAddressDto) {
        const postalCode = dto.postal_code.replace(/\D/g, '');
        if (!/^\d{8}$/.test(postalCode)) throw new BadRequestException('CEP inválido.');
        const state = dto.state.toUpperCase();
        let result;
        try {
            result = await this.mapsProvider.geocode({
                formatted_address: [dto.street, dto.address_number, dto.address_complement, dto.neighborhood, dto.city, state, postalCode]
                    .filter(Boolean).join(', '),
                postal_code: postalCode,
                street: dto.street,
                address_number: dto.address_number,
                neighborhood: dto.neighborhood,
                city: dto.city,
                state,
            });
        } catch (_error) {
            // A map provider outage or an address absent from the map must be
            // reported as a correctable address error, never as HTTP 500.
            throw new BadRequestException('Não foi possível localizar este endereço. Confira o CEP, a cidade e o estado e tente novamente.');
        }
        if (!Number.isFinite(result.lat) || result.lat < -90 || result.lat > 90 || !Number.isFinite(result.lng) || result.lng < -180 || result.lng > 180) {
            throw new BadRequestException('O provedor de mapas retornou coordenadas inválidas.');
        }
        return {
            latitude: result.lat,
            longitude: result.lng,
            geocode_provider: result.provider,
            geocode_provider_id: result.provider_id || null,
            geocode_quality: result.quality,
            requires_confirmation: result.quality === 'AMBIGUOUS' || result.quality === 'APPROXIMATE',
        };
    }

    async reverseGeocode(dto: ReverseGeocodeDeliveryAddressDto) {
        if (!Number.isFinite(dto.latitude) || !Number.isFinite(dto.longitude)) {
            throw new BadRequestException('Informe coordenadas válidas para localizar o restaurante.');
        }
        let result;
        try {
            result = await this.mapsProvider.reverseGeocode({ lat: dto.latitude, lng: dto.longitude });
        } catch (_error) {
            throw new BadRequestException('Não foi possível localizar este endereço pelas coordenadas. Confira a localização e tente novamente.');
        }
        if (!Number.isFinite(result.lat) || result.lat < -90 || result.lat > 90 || !Number.isFinite(result.lng) || result.lng < -180 || result.lng > 180) {
            throw new BadRequestException('O provedor de mapas retornou coordenadas inválidas.');
        }
        return {
            latitude: result.lat,
            longitude: result.lng,
            formatted_address: result.formatted_address || null,
            street: result.street || null,
            address_number: result.address_number || null,
            neighborhood: result.neighborhood || null,
            city: result.city || null,
            state: result.state || null,
            postal_code: result.postal_code || null,
            geocode_provider: result.provider,
            geocode_provider_id: result.provider_id || null,
            geocode_quality: result.quality,
            requires_confirmation: result.quality !== 'ROOFTOP',
        };
    }
}

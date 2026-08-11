import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DELIVERY_MAPS_PROVIDER, DeliveryMapsProvider } from './maps/maps-provider';
import { GeocodeDeliveryAddressDto } from './dto/delivery-address-geocode.dto';

@Injectable()
export class DeliveryAddressGeocodeService {
    constructor(@Inject(DELIVERY_MAPS_PROVIDER) private readonly mapsProvider: DeliveryMapsProvider) { }

    async geocode(dto: GeocodeDeliveryAddressDto) {
        const postalCode = dto.postal_code.replace(/\D/g, '');
        if (!/^\d{8}$/.test(postalCode)) throw new BadRequestException('CEP inválido.');
        const state = dto.state.toUpperCase();
        const result = await this.mapsProvider.geocode({
            formatted_address: [dto.street, dto.address_number, dto.address_complement, dto.neighborhood, dto.city, state, postalCode]
                .filter(Boolean).join(', '),
            postal_code: postalCode,
            street: dto.street,
            address_number: dto.address_number,
            neighborhood: dto.neighborhood,
            city: dto.city,
            state,
        });
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
}

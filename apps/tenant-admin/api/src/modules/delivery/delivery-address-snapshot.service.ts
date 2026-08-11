import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliveryCreateInternalDto } from './dto/delivery-commands.dto';

/** Builds the historical address payload once, without copying operational flags. */
@Injectable()
export class DeliveryAddressSnapshotService {
    build(input: DeliveryCreateInternalDto) {
        const quality = input.geocode_quality ? String(input.geocode_quality).toUpperCase() : null;
        if (quality === 'AMBIGUOUS') {
            throw new BadRequestException('O endereço possui geocodificação ambígua e precisa ser corrigido antes da confirmação.');
        }
        if (input.address_confirmed === false) {
            throw new BadRequestException('O endereço precisa ser confirmado antes de criar a entrega.');
        }

        const postalCode = input.postal_code ? input.postal_code.replace(/\D/g, '') : null;
        const state = input.state ? input.state.toUpperCase() : null;
        const formattedAddress = input.formatted_address || [
            input.street,
            input.address_number,
            input.address_complement,
            input.neighborhood,
            input.city,
            state,
            postalCode,
        ].filter(Boolean).join(', ') || null;

        return {
            schema_version: 1,
            confirmed_at: new Date().toISOString(),
            postal_code: postalCode,
            street: input.street || null,
            address_number: input.address_number || null,
            address_complement: input.address_complement || null,
            neighborhood: input.neighborhood || null,
            city: input.city || null,
            state,
            address_reference: input.address_reference || null,
            formatted_address: formattedAddress,
            destination_lat: Number.isFinite(Number(input.destination_lat)) ? Number(input.destination_lat) : null,
            destination_lng: Number.isFinite(Number(input.destination_lng)) ? Number(input.destination_lng) : null,
            geocode_provider: input.geocode_provider || null,
            geocode_provider_id: input.geocode_provider_id || null,
            geocode_quality: quality,
        };
    }
}

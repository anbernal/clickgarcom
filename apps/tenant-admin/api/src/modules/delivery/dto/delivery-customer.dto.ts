import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ResolveDeliveryCustomerDto {
    @IsString()
    @MaxLength(30)
    phone!: string;
}

export class CreateCustomerAddressDto {
    @IsString()
    @MaxLength(80)
    label!: string;

    @IsString()
    @Matches(/^\d{5}-?\d{3}$/)
    postal_code!: string;

    @IsString()
    @MaxLength(255)
    street!: string;

    @IsString()
    @MaxLength(30)
    address_number!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    address_complement?: string;

    @IsString()
    @MaxLength(255)
    neighborhood!: string;

    @IsString()
    @MaxLength(255)
    city!: string;

    @IsString()
    @Matches(/^[A-Za-z]{2}$/)
    state!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    address_reference?: string;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    postal_code_provider?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    postal_code_provider_ref?: string;

    @IsOptional()
    @IsString()
    @IsIn(['FOUND', 'NOT_FOUND', 'MANUAL', 'ERROR'])
    postal_code_lookup_status?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    geocode_provider?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    geocode_provider_id?: string;

    @IsOptional()
    @IsString()
    @IsIn(['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'])
    geocode_quality?: string;

    @IsBoolean()
    confirmed!: boolean;

    @IsOptional()
    @IsBoolean()
    is_default?: boolean;
}

export class UpdateCustomerAddressDto {
    @IsOptional()
    @IsString()
    @MaxLength(80)
    label?: string;

    @IsOptional()
    @Matches(/^\d{5}-?\d{3}$/)
    postal_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    street?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    address_number?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    address_complement?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    neighborhood?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    city?: string;

    @IsOptional()
    @Matches(/^[A-Za-z]{2}$/)
    state?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    address_reference?: string;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsOptional()
    @IsBoolean()
    confirmed?: boolean;

    @IsOptional()
    @IsBoolean()
    is_default?: boolean;
}

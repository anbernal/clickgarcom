import { IsNumber, IsOptional, IsString, Max, MaxLength, Matches, Min } from 'class-validator';

export class GeocodeDeliveryAddressDto {
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

    @IsString()
    @Matches(/^\d{5}-?\d{3}$/)
    postal_code!: string;
}

export class ReverseGeocodeDeliveryAddressDto {
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude!: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude!: number;
}

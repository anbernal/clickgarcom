import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateExternalDeliveryQuoteDto {
    @IsString()
    @MaxLength(255)
    checkout_key!: string;

    @IsUUID()
    customer_id!: string;

    @IsUUID()
    customer_address_id!: string;

    @IsString()
    @MaxLength(1000)
    formatted_address!: string;

    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude!: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude!: number;

    @IsNumber()
    @Min(0)
    @Max(1000000)
    order_total!: number;
}

export class UseExternalDeliveryQuoteDto {
    @IsUUID()
    quote_id!: string;

    @IsOptional()
    @IsUUID()
    delivery_id?: string;
}

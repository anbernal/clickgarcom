import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateExternalFulfillmentDto {
    @IsUUID()
    delivery_id!: string;

    @IsUUID()
    quote_id!: string;
}

export class DeliveryFulfillmentFallbackDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}

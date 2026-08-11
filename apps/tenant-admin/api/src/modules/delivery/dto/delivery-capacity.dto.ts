import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class DeliveryCapacityHoldDto {
    @IsString()
    @MaxLength(255)
    checkout_key!: string;
}

export class DeliveryCapacityConfirmDto extends DeliveryCapacityHoldDto {
    @IsOptional()
    @IsUUID()
    delivery_id?: string;
}

export class DeliveryCapacityReleaseDto extends DeliveryCapacityHoldDto {
    @IsOptional()
    @IsString()
    @MaxLength(80)
    reason?: string;
}

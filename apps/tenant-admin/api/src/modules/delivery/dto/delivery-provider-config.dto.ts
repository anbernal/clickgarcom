import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateDeliveryProviderConfigDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsIn(['SANDBOX', 'PRODUCTION'])
    environment?: 'SANDBOX' | 'PRODUCTION';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    priority?: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    external_merchant_id?: string;
}

export class SaveDeliveryProviderCredentialsDto {
    @IsObject()
    credentials!: Record<string, unknown>;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    key_version?: string;
}

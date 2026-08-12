import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const DELIVERY_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export class DeliveryWindowDto {
    @IsArray()
    @IsIn(DELIVERY_DAYS, { each: true })
    days!: string[];

    @IsString()
    @MaxLength(5)
    start!: string;

    @IsString()
    @MaxLength(5)
    end!: string;
}

export class DeliveryAutoAcceptSettingsDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsBoolean()
    require_confirmed_payment?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(500)
    max_active_deliveries?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeliveryWindowDto)
    windows?: DeliveryWindowDto[];
}

export class DeliveryFeeBandDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(500)
    from_km?: number;

    @IsNumber()
    @Min(0.01)
    @Max(500)
    up_to_km!: number;

    @IsNumber()
    @Min(0)
    @Max(10000)
    fee!: number;
}

export class DeliveryFeesDto {
    @IsIn(['NONE', 'FIXED', 'DISTANCE_BANDS', 'PER_KM', 'HYBRID'])
    mode!: 'NONE' | 'FIXED' | 'DISTANCE_BANDS' | 'PER_KM' | 'HYBRID';

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(10000)
    fixed_fee?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeliveryFeeBandDto)
    bands?: DeliveryFeeBandDto[];

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(500)
    included_km?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(10000)
    price_per_km?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(10000)
    minimum_fee?: number;

    @IsOptional()
    @IsIn(['NONE', 'CEIL_0_5_KM', 'CEIL_1_KM'])
    rounding_mode?: 'NONE' | 'CEIL_0_5_KM' | 'CEIL_1_KM';

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeliverySurchargeDto)
    surcharges?: DeliverySurchargeDto[];
}

export class DeliverySurchargeDto {
    @IsString()
    @MaxLength(80)
    code!: string;

    @IsIn(['FIXED', 'PERCENT'])
    mode!: 'FIXED' | 'PERCENT';

    @IsNumber()
    @Min(0)
    @Max(10000)
    amount!: number;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}

export class DeliveryOriginAddressDto {
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
    @IsString()
    @Matches(/^[A-Za-z]{2}$/)
    state?: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{5}-?\d{3}$/)
    postal_code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    formatted_address?: string;

    @IsOptional()
    @IsString()
    @MaxLength(40)
    geocode_provider?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    geocode_provider_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    geocode_quality?: string;

    @IsOptional()
    @IsBoolean()
    confirmed?: boolean;
}

export class UpdateDeliverySettingsDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    timezone?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryAutoAcceptSettingsDto)
    auto_accept?: DeliveryAutoAcceptSettingsDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryFeesDto)
    fees?: DeliveryFeesDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryFeesDto)
    own_delivery_pricing?: DeliveryFeesDto;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    origin_lat?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    origin_lng?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(500)
    service_radius_km?: number;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryOriginAddressDto)
    origin_address?: DeliveryOriginAddressDto;

    @IsOptional()
    @IsIn(['OWN', 'EXTERNAL'])
    default_fulfillment_mode?: 'OWN' | 'EXTERNAL';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(500)
    own_available_couriers?: number;

    @IsOptional()
    @IsArray()
    @IsIn(['IFOOD'], { each: true })
    external_provider_order?: string[];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(5)
    external_max_attempts?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(60)
    external_attempt_window_minutes?: number;
}

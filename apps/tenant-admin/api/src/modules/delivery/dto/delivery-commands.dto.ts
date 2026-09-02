import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

import {
    DeliveryCancellationReason,
    DeliveryExceptionReason,
    DeliveryOverrideReason,
    DeliveryRejectionReason,
} from '../contracts';

export class ListDeliveriesQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    status?: string;

    @IsOptional()
    @IsUUID()
    driver_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    code?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit = 30;
}

export class DeliveryFeeQuoteQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(500000)
    distance_meters?: number;

    @IsOptional()
    @Type(() => Number)
    @IsLatitude()
    destination_lat?: number;

    @IsOptional()
    @Type(() => Number)
    @IsLongitude()
    destination_lng?: number;
}

export class DeliveryRejectDto {
    @IsEnum(DeliveryRejectionReason)
    reason_code!: DeliveryRejectionReason;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}

export class DeliveryAcceptDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(240)
    estimated_minutes!: number;
}

export class DeliveryCancelDto {
    @IsEnum(DeliveryCancellationReason)
    reason_code!: DeliveryCancellationReason;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}

export class DeliveryAssignDto {
    @IsUUID()
    driver_id!: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    expected_version!: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}

export class DeliveryCreateInternalDto {
    @IsUUID()
    tenant_id!: string;

    @IsUUID()
    tab_id!: string;

    @IsUUID()
    batch_id!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    customer_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    customer_phone?: string;

    @IsOptional()
    @IsUUID()
    customer_id?: string;

    @IsOptional()
    @IsUUID()
    customer_address_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
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
    @IsString()
    @MaxLength(2)
    state?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    address_reference?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    formatted_address?: string;

    @IsNumber()
    @Min(-90)
    @Max(90)
    destination_lat!: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    destination_lng!: number;

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
    address_confirmed?: boolean;

    @IsOptional()
    @IsBoolean()
    payment_confirmed?: boolean;

    @IsOptional()
    @IsBoolean()
    items_available?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    idempotency_key?: string;
}

/**
 * Event/reconciliation command emitted by the order projector. The delivery
 * payload is optional when the delivery was already created by the ordering
 * flow; it is required only when this command is also responsible for the
 * first idempotent creation.
 */
export class DeliveryOrderEventDto {
    @IsUUID()
    tenant_id!: string;

    @IsUUID()
    batch_id!: string;

    @IsOptional()
    @IsUUID()
    event_id?: string;

    @IsOptional()
    @IsUUID()
    order_id?: string;

    @IsOptional()
    @IsBoolean()
    payment_confirmed?: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryCreateInternalDto)
    delivery?: DeliveryCreateInternalDto;
}

export class DeliveryMaintenanceCommandDto {
    @IsOptional()
    @IsUUID()
    tenant_id?: string;

    @IsOptional()
    @IsBoolean()
    dry_run?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(500)
    limit?: number;
}

export class DeliveryLocationPointDto {
    @IsUUID()
    event_id!: string;

    @IsLatitude()
    lat!: number;

    @IsLongitude()
    lng!: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    accuracy_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    speed_mps?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(360)
    heading_deg?: number;

    @IsString()
    @IsDateString()
    recorded_at!: string;
}

export class DeliveryLocationsDto {
    @IsArray()
    @ArrayMaxSize(100)
    @Type(() => DeliveryLocationPointDto)
    points!: DeliveryLocationPointDto[];
}

export class CreateDeliveryTrackingLinkDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(168)
    ttl_hours = 24;
}

export class DeliveryTrackingSessionDto {
    @IsString()
    @MinLength(40)
    @MaxLength(100)
    token!: string;
}

export class DeliveryExceptionDto {
    @IsEnum(DeliveryExceptionReason)
    reason_code!: DeliveryExceptionReason;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class DeliveryStartReturnDto {
    @IsEnum(DeliveryExceptionReason)
    reason_code!: DeliveryExceptionReason;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    expected_version!: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class DeliveryCompleteReturnDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expected_version!: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class DeliveryOverrideDto {
    @IsEnum(DeliveryOverrideReason)
    reason_code!: DeliveryOverrideReason;

    @IsString()
    @MaxLength(1000)
    notes!: string;

    @IsOptional()
    @IsUUID()
    evidence_id?: string;
}

export class DeliveryOwnOperationDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expected_version!: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;

    /** Starts the restaurant-owned operation without assigning an individual courier. */
    @IsOptional()
    @IsBoolean()
    without_driver?: boolean;
}

export class DeliveryCompleteOwnDto extends DeliveryOwnOperationDto {
    @IsString()
    @Matches(/^(?:[0-9A-Fa-f]{4}|\d{6})$/)
    pin!: string;
}

export class DeliveryReportQueryDto {
    @IsOptional()
    @IsString()
    date_from?: string;

    @IsOptional()
    @IsString()
    date_to?: string;

    @IsOptional()
    @IsUUID()
    driver_id?: string;

    @IsOptional()
    @IsIn(['OWN', 'EXTERNAL'])
    mode?: string;

    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{1,40}$/)
    provider?: string;

    @IsOptional()
    @IsString()
    @Matches(/^[A-Z_]+(?:,[A-Z_]+)*$/)
    @MaxLength(500)
    status?: string;
}

export class DeliveryConfirmPinDto {
    @IsString()
    @Matches(/^(?:[0-9A-Fa-f]{4}|\d{6})$/)
    pin!: string;
}

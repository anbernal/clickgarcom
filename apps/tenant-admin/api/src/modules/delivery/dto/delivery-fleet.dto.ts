import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export enum DeliveryFleetMode { CapacityOnly = 'CAPACITY_ONLY', IdentifiedDrivers = 'IDENTIFIED_DRIVERS' }

export class UpdateDeliveryFleetConfigDto {
    @IsEnum(DeliveryFleetMode) mode!: DeliveryFleetMode;
    @Type(() => Number) @IsInt() @Min(1) expected_version!: number;
}

export class CreateDeliveryDriverDto {
    @IsString() @MinLength(3) @MaxLength(120) name!: string;
    @Matches(/^\d{11}$/) cpf!: string;
    @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i) plate!: string;
    @IsOptional() @IsString() @MaxLength(20) phone?: string;
    @Type(() => Number) @IsInt() @Min(1) @Max(10) delivery_limit = 1;
}

export class UpdateDeliveryDriverDto {
    @IsOptional() @IsString() @MinLength(3) @MaxLength(120) name?: string;
    @IsOptional() @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i) plate?: string;
    @IsOptional() @IsString() @MaxLength(20) phone?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) delivery_limit?: number;
    @Type(() => Number) @IsInt() @Min(1) expected_version!: number;
}

export class SetDeliveryDriverStatusDto {
    @IsString() @MinLength(2) @MaxLength(400) reason!: string;
    @Type(() => Number) @IsInt() @Min(1) expected_version!: number;
}

export class ReorderDeliveryDriverQueueDto {
    @IsArray() @IsUUID('4', { each: true }) assignment_ids!: string[];
}

export class DeliveryFleetAssignmentsQueryDto {
    @IsOptional() @IsString() @MaxLength(20) status?: string;
}

export class DeliveryFleetDriversQueryDto {
    @IsOptional() @Type(() => Boolean) @IsBoolean() include_inactive = false;
}

export class DeliveryFleetReportQueryDto {
    @IsOptional() @IsString() from?: string;
    @IsOptional() @IsString() to?: string;
}

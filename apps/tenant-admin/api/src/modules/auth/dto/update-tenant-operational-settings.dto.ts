import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, Max, Min } from 'class-validator';

export class UpdateTenantOperationalSettingsDto {
    @IsOptional()
    @Type(() => Number)
    @Min(0)
    @Max(30)
    service_fee_percent?: number;

    @IsOptional()
    @IsBoolean()
    split_enabled?: boolean;

    @IsOptional()
    @IsBoolean()
    auto_accept_orders?: boolean;

    @IsOptional()
    @IsBoolean()
    nps_enabled?: boolean;

    @IsOptional()
    @IsBoolean()
    voucher_enabled?: boolean;
}

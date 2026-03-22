import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'READY', 'DELIVERED', 'CANCELED'] as const;
const ORDER_CANCEL_CATEGORIES = ['stock', 'operational', 'customer', 'other'] as const;

export class UpdateOrderStatusDto {
    @IsString()
    @IsIn(ORDER_STATUSES)
    status: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    prep_minutes?: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    cancel_reason?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    cancel_reason_code?: string;

    @IsOptional()
    @IsString()
    @IsIn(ORDER_CANCEL_CATEGORIES)
    cancel_category?: string;
}

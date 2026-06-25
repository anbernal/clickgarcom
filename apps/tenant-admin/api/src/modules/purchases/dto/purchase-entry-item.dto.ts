import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PurchaseEntryItemDto {
    @IsString()
    @MaxLength(160)
    product_name: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0.001)
    quantity: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    unit_cost: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    notes?: string;
}

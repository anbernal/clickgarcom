import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUrl, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRetailProductDto {
    @IsString()
    @MaxLength(160)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    price: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    cost_price?: number;

    @IsOptional()
    @IsUUID()
    category_id?: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    image_url?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    sku?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    barcode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    brand?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    package_label?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    stock_quantity?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    low_stock_threshold?: number;

    @IsOptional()
    @IsBoolean()
    available?: boolean;
}

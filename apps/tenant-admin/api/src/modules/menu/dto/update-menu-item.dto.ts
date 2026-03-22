import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, IsUrl, MaxLength, Min } from 'class-validator';

export class UpdateMenuItemDto {
    @IsOptional()
    @IsString()
    @MaxLength(160)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    price?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    cost_price?: number;

    @IsOptional()
    @IsUUID()
    category_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    destination?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    prep_time_minutes?: number;

    @IsOptional()
    @IsUrl({ require_tld: false }, { message: 'image_url deve ser uma URL válida' })
    image_url?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    whatsapp_short_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    whatsapp_short_description?: string;

    @IsOptional()
    @IsBoolean()
    available?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    display_order?: number;
}

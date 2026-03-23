import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, IsUrl, MaxLength, Min, ValidateNested } from 'class-validator';
import { MenuItemAvailabilityWindowDto } from './menu-item-availability-window.dto';
import { MenuItemOptionGroupDto } from './menu-item-option-group.dto';
import { MenuItemComboComponentDto } from './menu-item-combo-component.dto';

export class CreateMenuItemDto {
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
    @IsString()
    @MaxLength(20)
    item_type?: string;

    @IsOptional()
    @IsBoolean()
    track_stock?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    stock_quantity?: number | null;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    low_stock_threshold?: number | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(21)
    @ValidateNested({ each: true })
    @Type(() => MenuItemAvailabilityWindowDto)
    availability_windows?: MenuItemAvailabilityWindowDto[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(15)
    @ValidateNested({ each: true })
    @Type(() => MenuItemOptionGroupDto)
    option_groups?: MenuItemOptionGroupDto[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => MenuItemComboComponentDto)
    combo_components?: MenuItemComboComponentDto[];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    display_order?: number;
}

import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class ManualOrderSelectedOptionDto {
    @IsOptional()
    @IsString()
    @MaxLength(120)
    group_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    option_name?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    price_delta?: number;
}

export class ManualOrderItemDto {
    @IsString()
    @MaxLength(36)
    menu_item_id!: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(99)
    quantity!: number;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    observations?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ManualOrderSelectedOptionDto)
    selected_options?: ManualOrderSelectedOptionDto[];
}

export class CreateManualOrderDto {
    @IsString()
    @MaxLength(36)
    tab_id!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ManualOrderItemDto)
    items!: ManualOrderItemDto[];

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}

export class UpdateManualOrderDto {
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}

export class UpdateManualOrderItemDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(99)
    quantity!: number;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    observations?: string;
}

export class VoidManualOrderItemDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(99)
    quantity?: number;

    @IsString()
    @MaxLength(500)
    reason!: string;
}

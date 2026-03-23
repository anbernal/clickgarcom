import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { MenuItemOptionDto } from './menu-item-option.dto';

export class MenuItemOptionGroupDto {
    @IsString()
    @MaxLength(120)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(280)
    description?: string;

    @IsOptional()
    @IsBoolean()
    required?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    min_select?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    max_select?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    display_order?: number;

    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => MenuItemOptionDto)
    options: MenuItemOptionDto[];
}

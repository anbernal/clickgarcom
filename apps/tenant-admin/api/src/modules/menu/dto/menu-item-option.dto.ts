import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class MenuItemOptionDto {
    @IsString()
    @MaxLength(120)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(280)
    description?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    price_delta?: number;

    @IsOptional()
    @IsBoolean()
    available?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    display_order?: number;
}

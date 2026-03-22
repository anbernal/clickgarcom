import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    @MaxLength(120)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsUrl({ require_tld: false }, { message: 'image_url deve ser uma URL válida' })
    image_url?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    display_order?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

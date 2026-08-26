import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRetailCategoryDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
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

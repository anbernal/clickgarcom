import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTableDto {
    @IsString()
    @MaxLength(20)
    number: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    capacity?: number;
}

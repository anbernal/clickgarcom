import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Matches, Min } from 'class-validator';

export class CreateManualRequestDto {
    @IsUUID()
    tableId: string;

    @IsString()
    @Matches(/^\d{10,15}$/)
    userPhone: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    paxCount: number;
}

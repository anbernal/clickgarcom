import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class MenuItemAvailabilityWindowDto {
    @IsInt()
    @Min(0)
    @Max(6)
    day_of_week: number;

    @IsString()
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'start_time deve estar no formato HH:MM' })
    start_time: string;

    @IsString()
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'end_time deve estar no formato HH:MM' })
    end_time: string;
}

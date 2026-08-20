import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class FleetDriverAccessTokenDto {
    @IsString()
    @MinLength(24)
    @MaxLength(512)
    token!: string;
}

export class FleetDriverPinDto {
    @IsString()
    @Matches(/^\d{6}$/)
    pin!: string;
}

export class FleetDriverLoginDto {
    @IsString()
    @Matches(/^\d{11}$/)
    cpf!: string;

    @IsString()
    @Matches(/^\d{6}$/)
    pin!: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    tenant_slug?: string;
}

export class FleetDriverShiftDto {
    @IsBoolean()
    open!: boolean;
}

export class FleetDriverIncidentDto {
    @IsString()
    @MinLength(2)
    @MaxLength(400)
    reason!: string;
}

export class FleetDriverCompletionDto {
    @IsString()
    @Matches(/^[0-9A-Fa-f]{4}$/)
    pin!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;

    @IsOptional()
    expected_version?: number;
}

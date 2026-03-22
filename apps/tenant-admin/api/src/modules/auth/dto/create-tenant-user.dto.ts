import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantUserDto {
    @IsString()
    @MaxLength(255)
    name: string;

    @IsEmail()
    @MaxLength(255)
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    @MaxLength(20)
    role: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantUserDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    role?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;
}

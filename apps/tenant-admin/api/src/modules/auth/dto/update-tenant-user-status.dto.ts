import { IsBoolean } from 'class-validator';

export class UpdateTenantUserStatusDto {
    @IsBoolean()
    active: boolean;
}

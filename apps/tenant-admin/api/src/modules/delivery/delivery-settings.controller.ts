import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_FULL_ACCESS_ROLES } from '../auth/roles';
import { DeliverySettingsService } from './delivery-settings.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';

@Controller('admin/api/delivery/settings')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_FULL_ACCESS_ROLES)
export class DeliverySettingsController {
    constructor(private readonly settingsService: DeliverySettingsService) { }

    @Get()
    get(@Request() request: any) {
        return this.settingsService.get(request.user.tenantId);
    }

    @Put()
    update(@Request() request: any, @Body() body: UpdateDeliverySettingsDto) {
        return this.settingsService.update(request.user.tenantId, body, {
            userId: request.user.id,
            userName: request.user.name,
            userRole: request.user.role,
        });
    }
}


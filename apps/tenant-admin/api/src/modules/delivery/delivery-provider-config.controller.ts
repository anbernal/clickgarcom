import { Body, Controller, Delete, Get, Param, Put, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_FULL_ACCESS_ROLES } from '../auth/roles';
import { DeliveryProviderConfigService } from './delivery-provider-config.service';
import { SaveDeliveryProviderCredentialsDto, UpdateDeliveryProviderConfigDto } from './dto/delivery-provider-config.dto';

@Controller('admin/api/delivery/providers')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_FULL_ACCESS_ROLES)
export class DeliveryProviderConfigController {
    constructor(private readonly providerService: DeliveryProviderConfigService) { }

    @Get()
    list(@Request() request: any) {
        return this.providerService.list(request.user.tenantId);
    }

    @Put(':provider')
    upsert(@Request() request: any, @Param('provider') provider: string, @Body() body: UpdateDeliveryProviderConfigDto) {
        return this.providerService.upsert(request.user.tenantId, provider, body);
    }

    @Post(':provider/credentials')
    saveCredentials(@Request() request: any, @Param('provider') provider: string, @Body() body: SaveDeliveryProviderCredentialsDto) {
        return this.providerService.saveCredentials(request.user.tenantId, provider, body);
    }

    @Delete(':provider/credentials')
    revokeCredentials(@Request() request: any, @Param('provider') provider: string) {
        return this.providerService.revokeCredentials(request.user.tenantId, provider);
    }

    @Post(':provider/test-connection')
    testConnection(@Request() request: any, @Param('provider') provider: string) {
        return this.providerService.testConnection(request.user.tenantId, provider);
    }
}

import { Body, Controller, Get, Headers, Post, Query, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DISPATCH_ROLES, TENANT_FULL_ACCESS_ROLES } from '../auth/roles';
import { DeliveryCapacityService } from './delivery-capacity.service';
import { DeliveryCapacityConfirmDto, DeliveryCapacityHoldDto, DeliveryCapacityReleaseDto } from './dto/delivery-capacity.dto';

@Controller('admin/api/delivery/capacity')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
export class DeliveryCapacityController {
    constructor(private readonly capacityService: DeliveryCapacityService) { }

    @Get()
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    summary(@Request() request: any) {
        return this.capacityService.summary(request.user.tenantId);
    }

    @Get('reservations')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    reservations(@Request() request: any, @Query('include_history') includeHistory?: string) {
        return this.capacityService.listReservations(request.user.tenantId, includeHistory === 'true');
    }

    @Post('hold')
    hold(@Request() request: any, @Body() body: DeliveryCapacityHoldDto) {
        return this.capacityService.hold(request.user.tenantId, body.checkout_key);
    }

    @Post('confirm')
    confirm(@Request() request: any, @Body() body: DeliveryCapacityConfirmDto) {
        return this.capacityService.confirm(request.user.tenantId, body.checkout_key, body.delivery_id);
    }

    @Post('release')
    release(@Request() request: any, @Body() body: DeliveryCapacityReleaseDto) {
        return this.capacityService.release(request.user.tenantId, body.checkout_key, body.reason);
    }
}

@Controller('admin/api/internal/delivery/capacity')
export class DeliveryCapacityInternalController {
    constructor(private readonly capacityService: DeliveryCapacityService) { }

    @Post('hold')
    hold(@Headers('x-internal-token') token: string, @Body() body: DeliveryCapacityHoldDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.capacityService.hold(body.tenant_id, body.checkout_key);
    }

    @Post('confirm')
    confirm(@Headers('x-internal-token') token: string, @Body() body: DeliveryCapacityConfirmDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.capacityService.confirm(body.tenant_id, body.checkout_key, body.delivery_id);
    }

    @Post('release')
    release(@Headers('x-internal-token') token: string, @Body() body: DeliveryCapacityReleaseDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.capacityService.release(body.tenant_id, body.checkout_key, body.reason);
    }

    @Post('expire')
    expire(@Headers('x-internal-token') token: string, @Body() body: { tenant_id?: string }) {
        this.assertInternalToken(token);
        return this.capacityService.expire(body?.tenant_id);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) throw new UnauthorizedException('invalid internal token');
    }
}

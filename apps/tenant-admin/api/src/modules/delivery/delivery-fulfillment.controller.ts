import { Body, Controller, Get, Headers, Param, Post, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DISPATCH_ROLES } from '../auth/roles';
import { CreateExternalFulfillmentDto, DeliveryFulfillmentFallbackDto } from './dto/delivery-fulfillment.dto';
import { DeliveryFulfillmentService } from './delivery-fulfillment.service';
import { TENANT_DELIVERY_OVERRIDE_ROLES } from '../auth/roles';

@Controller('admin/api/delivery/fulfillments')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
export class DeliveryFulfillmentController {
    constructor(private readonly fulfillmentService: DeliveryFulfillmentService) { }

    @Get(':deliveryId/current')
    current(@Request() request: any, @Param('deliveryId') deliveryId: string) {
        return this.fulfillmentService.findCurrent(request.user.tenantId, deliveryId);
    }

    @Post('external')
    createExternal(@Request() request: any, @Body() body: CreateExternalFulfillmentDto) {
        return this.fulfillmentService.createExternal(request.user.tenantId, body);
    }

    @Post(':deliveryId/restart-cycle')
    @Roles(...TENANT_DELIVERY_OVERRIDE_ROLES)
    restartCycle(@Request() request: any, @Param('deliveryId') deliveryId: string, @Body() body: DeliveryFulfillmentFallbackDto) {
        return this.fulfillmentService.restartExternalCycle(request.user.tenantId, deliveryId, body.reason, this.actor(request));
    }

    @Post(':deliveryId/convert-to-own')
    @Roles(...TENANT_DELIVERY_OVERRIDE_ROLES)
    convertToOwn(@Request() request: any, @Param('deliveryId') deliveryId: string, @Body() body: DeliveryFulfillmentFallbackDto) {
        return this.fulfillmentService.convertToOwn(request.user.tenantId, deliveryId, body.reason, this.actor(request));
    }

    private actor(request: any) {
        return { id: request.user.id, name: request.user.name, role: request.user.role };
    }
}

@Controller('admin/api/internal/delivery/fulfillments')
export class DeliveryFulfillmentInternalController {
    constructor(private readonly fulfillmentService: DeliveryFulfillmentService) { }

    @Post('external')
    createExternal(@Headers('x-internal-token') token: string, @Body() body: CreateExternalFulfillmentDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.fulfillmentService.createExternal(body.tenant_id, body);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) throw new UnauthorizedException('invalid internal token');
    }
}

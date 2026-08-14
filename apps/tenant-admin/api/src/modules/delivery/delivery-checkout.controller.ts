import { Body, Controller, Get, Headers, Param, Post, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DISPATCH_ROLES } from '../auth/roles';
import { ConfirmDeliveryCheckoutDto, ConfirmPaidDeliveryCheckoutDto, CreateDeliveryCheckoutDto } from './dto/delivery-checkout.dto';
import { DeliveryCheckoutService } from './delivery-checkout.service';

@Controller('admin/api/delivery/checkout')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
export class DeliveryCheckoutController {
    constructor(private readonly checkoutService: DeliveryCheckoutService) { }

    @Post()
    create(@Request() request: any, @Body() body: CreateDeliveryCheckoutDto) {
        return this.checkoutService.create(request.user.tenantId, body);
    }

    @Post('confirm')
    confirm(@Request() request: any, @Body() body: ConfirmDeliveryCheckoutDto) {
        return this.checkoutService.confirm(request.user.tenantId, body);
    }
}

@Controller('admin/api/internal/delivery/checkout')
export class DeliveryCheckoutInternalController {
    constructor(private readonly checkoutService: DeliveryCheckoutService) { }

    @Post()
    create(@Headers('x-internal-token') token: string, @Body() body: CreateDeliveryCheckoutDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.checkoutService.create(body.tenant_id, body);
    }

    @Post('confirm')
    confirm(@Headers('x-internal-token') token: string, @Body() body: ConfirmDeliveryCheckoutDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.checkoutService.confirm(body.tenant_id, body);
    }

    @Post('confirm-paid')
    confirmPaid(@Headers('x-internal-token') token: string, @Body() body: ConfirmPaidDeliveryCheckoutDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.checkoutService.confirmPaidInternally(body.tenant_id, body);
    }

    @Post(':checkoutKey/cancel')
    cancel(@Headers('x-internal-token') token: string, @Param('checkoutKey') checkoutKey: string, @Headers('x-tenant-id') tenantId?: string) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.checkoutService.cancel(tenantId, checkoutKey);
    }

    @Get(':checkoutKey')
    get(@Headers('x-internal-token') token: string, @Param('checkoutKey') checkoutKey: string, @Headers('x-tenant-id') tenantId?: string) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.checkoutService.get(tenantId, checkoutKey);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) throw new UnauthorizedException('invalid internal token');
    }
}

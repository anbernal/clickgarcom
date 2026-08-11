import { Body, Controller, Get, Headers, Param, Post, Query, Request, UnauthorizedException } from '@nestjs/common';

import { DeliveryService } from './delivery.service';
import { DeliveryEtaService } from './delivery-eta.service';
import { DeliveryMaintenanceService } from './delivery-maintenance.service';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { DeliveryCreateInternalDto, DeliveryMaintenanceCommandDto, DeliveryOrderEventDto } from './dto/delivery-commands.dto';

@Controller('admin/api/internal/deliveries')
export class DeliveryInternalController {
    constructor(
        private readonly deliveryService: DeliveryService,
        private readonly maintenanceService: DeliveryMaintenanceService,
        private readonly etaService: DeliveryEtaService,
        private readonly trackingService: DeliveryTrackingService,
    ) { }

    @Post()
    create(@Headers('x-internal-token') token: string, @Body() body: DeliveryCreateInternalDto) {
        this.assertInternalToken(token);
        return this.deliveryService.createFromBatch(body);
    }

    @Post('order-event')
    reconcileOrderEvent(@Headers('x-internal-token') token: string, @Body() body: DeliveryOrderEventDto) {
        this.assertInternalToken(token);
        return this.deliveryService.reconcileOrderBatch(body);
    }

    @Post('maintenance/run')
    maintenance(@Headers('x-internal-token') token: string, @Body() body: DeliveryMaintenanceCommandDto) {
        this.assertInternalToken(token);
        return this.maintenanceService.runOnce({
            tenantId: body?.tenant_id,
            dryRun: body?.dry_run === true,
            limit: body?.limit,
        });
    }

    @Get('maintenance/metrics')
    metrics(@Headers('x-internal-token') token: string, @Query('tenant_id') tenantId?: string) {
        this.assertInternalToken(token);
        return this.maintenanceService.metrics(tenantId);
    }

    @Post(':id/eta/recalculate')
    recalculateEta(
        @Headers('x-internal-token') token: string,
        @Param('id') deliveryId: string,
        @Body() body: { tenant_id?: string; reason?: string },
    ) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.etaService.recalculate(body.tenant_id, deliveryId, body.reason || 'INTERNAL_REQUEST');
    }

    /**
     * Bridges the HttpOnly tracking cookie to Core's isolated websocket room.
     * Only Core may call this endpoint with the internal service credential;
     * it returns scope identifiers, never the opaque customer token.
     */
    @Get('tracking/authorize')
    async authorizeTracking(@Headers('x-internal-token') token: string, @Request() request: any) {
        this.assertInternalToken(token);
        const credential = await this.trackingService.authorize(this.readTrackingCookie(request));
        return {
            tenant_id: credential.tenantId,
            delivery_id: credential.deliveryId,
        };
    }

    private assertInternalToken(token?: string) {
        // Delivery commands mutate tenant state; fail closed when the shared
        // service credential was not provisioned instead of accepting a
        // development fallback in a deployed API.
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) {
            throw new UnauthorizedException('invalid internal token');
        }
    }

    private readTrackingCookie(request: any) {
        const direct = request?.cookies?.delivery_tracking_token;
        if (direct) return String(direct);
        const header = String(request?.headers?.cookie || '');
        const item = header.split(';').map((part) => part.trim()).find((part) => part.startsWith('delivery_tracking_token='));
        return item ? decodeURIComponent(item.slice('delivery_tracking_token='.length)) : '';
    }
}

import { Body, Controller, Get, Headers, Param, Post, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DRIVER_ROLES } from '../auth/roles';
import { DeliveryService } from './delivery.service';
import { DeliveryConfirmPinDto, DeliveryExceptionDto, DeliveryLocationsDto } from './dto/delivery-commands.dto';
import { DeliveryLocationService } from './delivery-location.service';

@Controller('admin/api/driver/deliveries')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_DRIVER_ROLES)
export class DeliveryDriverController {
    constructor(
        private readonly deliveryService: DeliveryService,
        private readonly locationService: DeliveryLocationService,
    ) { }

    @Get('active')
    active(@Request() request: any) {
        return this.deliveryService.activeForDriver(request.user.tenantId, request.user.id);
    }

    @Post(':id/pickup')
    pickup(@Request() request: any, @Param('id') id: string, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.pickupForDriver(request.user.tenantId, id, request.user.id, idempotencyKey);
    }

    @Post(':id/arrive')
    arrive(@Request() request: any, @Param('id') id: string) {
        return this.deliveryService.arriveForDriver(request.user.tenantId, id, request.user.id);
    }

    @Post(':id/locations')
    locations(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryLocationsDto) {
        return this.locationService.record(request.user.tenantId, id, request.user.id, body);
    }

    @Post(':id/confirm-pin')
    confirmPin(
        @Request() request: any,
        @Param('id') id: string,
        @Body() command: DeliveryConfirmPinDto,
        @Headers('idempotency-key') idempotencyKey?: string,
    ) {
        return this.deliveryService.confirmPinForDriver(
            request.user.tenantId,
            id,
            request.user.id,
            command,
            idempotencyKey,
        );
    }

    @Post(':id/exception')
    exception(
        @Request() request: any,
        @Param('id') id: string,
        @Body() command: DeliveryExceptionDto,
        @Headers('idempotency-key') idempotencyKey?: string,
    ) {
        return this.deliveryService.openExceptionForDriver(
            request.user.tenantId,
            id,
            request.user.id,
            command,
            idempotencyKey,
        );
    }
}

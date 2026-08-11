import { Body, Controller, Get, Headers, Param, Post, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import {
    TENANT_DELIVERY_DISPATCH_ROLES,
    TENANT_DELIVERY_OVERRIDE_ROLES,
    TENANT_DELIVERY_READ_ROLES,
} from '../auth/roles';
import { DeliveryService } from './delivery.service';
import {
    DeliveryAssignDto,
    DeliveryCancelDto,
    DeliveryCompleteReturnDto,
    DeliveryFeeQuoteQueryDto,
    DeliveryOwnOperationDto,
    DeliveryOverrideDto,
    DeliveryRejectDto,
    DeliveryStartReturnDto,
    ListDeliveriesQueryDto,
} from './dto/delivery-commands.dto';

@Controller('admin/api/deliveries')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_READ_ROLES)
export class DeliveryController {
    constructor(private readonly deliveryService: DeliveryService) { }

    @Get()
    list(@Request() request: any, @Query() query: ListDeliveriesQueryDto) {
        return this.deliveryService.list(request.user.tenantId, query);
    }

    @Get('operations/summary')
    summary(@Request() request: any) {
        return this.deliveryService.summary(request.user.tenantId);
    }

    @Get('quote')
    quote(@Request() request: any, @Query() query: DeliveryFeeQuoteQueryDto) {
        return this.deliveryService.quoteFee(request.user.tenantId, query);
    }

    @Get('drivers/eligible')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    eligibleDrivers(@Request() request: any) {
        return this.deliveryService.listEligibleDrivers(request.user.tenantId);
    }

    @Get(':id/timeline')
    timeline(@Request() request: any, @Param('id') id: string) {
        return this.deliveryService.timeline(request.user.tenantId, id);
    }

    @Get(':id')
    findOne(@Request() request: any, @Param('id') id: string) {
        return this.deliveryService.findOne(request.user.tenantId, id);
    }

    @Post(':id/accept')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    accept(@Request() request: any, @Param('id') id: string, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.accept(request.user.tenantId, id, this.actor(request), idempotencyKey);
    }

    @Post(':id/reject')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    reject(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryRejectDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.reject(request.user.tenantId, id, body, this.actor(request), idempotencyKey);
    }

    @Post(':id/cancel')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    cancel(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryCancelDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.cancel(request.user.tenantId, id, body, this.actor(request), idempotencyKey);
    }

    @Post(':id/own/start')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    startOwn(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryOwnOperationDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.startOwn(request.user.tenantId, id, this.actor(request), body, idempotencyKey);
    }

    @Post(':id/own/complete')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    completeOwn(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryOwnOperationDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.completeOwn(request.user.tenantId, id, this.actor(request), body, idempotencyKey);
    }

    @Post(':id/assign')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    assign(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryAssignDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.assign(request.user.tenantId, id, body, this.actor(request), idempotencyKey);
    }

    @Post(':id/start-return')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    startReturn(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryStartReturnDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.startReturn(request.user.tenantId, id, body, this.actor(request), idempotencyKey);
    }

    @Post(':id/complete-return')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    completeReturn(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryCompleteReturnDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.completeReturn(request.user.tenantId, id, body, this.actor(request), idempotencyKey);
    }

    @Post(':id/override-delivery')
    @Roles(...TENANT_DELIVERY_OVERRIDE_ROLES)
    overrideDelivery(@Request() request: any, @Param('id') id: string, @Body() body: DeliveryOverrideDto, @Headers('idempotency-key') idempotencyKey?: string) {
        return this.deliveryService.overrideDelivery(request.user.tenantId, id, body, this.actor(request), idempotencyKey);
    }

    private actor(request: any) {
        return {
            id: request.user.id,
            name: request.user.name,
            role: request.user.role,
        };
    }
}

import { Controller, Get, Patch, Post, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Roles } from '../auth/roles.decorator';
import { TENANT_ORDER_WRITE_ROLES } from '../auth/roles';
import { TENANT_MANUAL_ORDER_ROLES } from '../auth/roles';
import {
    CreateManualOrderDto,
    UpdateManualOrderDto,
    UpdateManualOrderItemDto,
    VoidManualOrderItemDto,
} from './dto/create-manual-order.dto';

@Controller('admin/api/orders')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_ORDER_WRITE_ROLES)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Get()
    findAll(
        @Request() req,
        @Query('status') status?: string,
    ) {
        return this.ordersService.findAll(req.user.tenantId, status);
    }

    @Get('operations/summary')
    getOperationsSummary(@Request() req) {
        return this.ordersService.getOperationsSummary(req.user.tenantId);
    }

    @Post('manual')
    @Roles(...TENANT_MANUAL_ORDER_ROLES)
    createManual(@Request() req, @Body() body: CreateManualOrderDto) {
        return this.ordersService.createManualOrder(req.user.tenantId, body, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }

    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.ordersService.findOne(id, req.user.tenantId);
    }

    @Patch(':id/status')
    updateStatus(
        @Request() req,
        @Param('id') id: string,
        @Body() body: UpdateOrderStatusDto,
    ) {
        return this.ordersService.updateStatus(
            id,
            body.status,
            req.user.tenantId,
            body.prep_minutes,
            body.cancel_reason,
            body.cancel_reason_code,
            body.cancel_category,
            req.user?.id,
            req.user?.name,
            req.user?.role,
        );
    }

    @Patch(':id/manual')
    @Roles(...TENANT_MANUAL_ORDER_ROLES)
    updateManual(
        @Request() req,
        @Param('id') id: string,
        @Body() body: UpdateManualOrderDto,
    ) {
        return this.ordersService.updateManualOrder(id, req.user.tenantId, body, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }

    @Patch(':id/items/:itemId/manual')
    @Roles(...TENANT_MANUAL_ORDER_ROLES)
    updateManualItem(
        @Request() req,
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @Body() body: UpdateManualOrderItemDto,
    ) {
        return this.ordersService.updateManualOrderItem(id, itemId, req.user.tenantId, body, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }

    @Post(':id/items/:itemId/void')
    @Roles(...TENANT_MANUAL_ORDER_ROLES)
    voidManualItem(
        @Request() req,
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @Body() body: VoidManualOrderItemDto,
    ) {
        return this.ordersService.voidManualOrderItem(id, itemId, req.user.tenantId, body, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }
}

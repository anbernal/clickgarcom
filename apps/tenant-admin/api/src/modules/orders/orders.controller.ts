import { Controller, Get, Patch, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Roles } from '../auth/roles.decorator';
import { TENANT_ORDER_WRITE_ROLES } from '../auth/roles';

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
        );
    }
}

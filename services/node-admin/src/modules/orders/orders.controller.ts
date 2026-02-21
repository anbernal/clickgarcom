import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('admin/api/orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Get()
    findAll(
        @Query('tenant_id') tenantId?: string,
        @Query('status') status?: string,
    ) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.ordersService.findAll(tid, status);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.ordersService.findOne(id);
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
        return this.ordersService.updateStatus(id, body.status);
    }
}

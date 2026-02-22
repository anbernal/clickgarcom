import { Controller, Get, Patch, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';

@Controller('admin/api/orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @UseGuards(JwtAuthGuard)
    @Get()
    findAll(
        @Request() req,
        @Query('status') status?: string,
    ) {
        return this.ordersService.findAll(req.user.tenantId, status);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.ordersService.findOne(id, req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch(':id/status')
    updateStatus(@Request() req, @Param('id') id: string, @Body() body: { status: string }) {
        return this.ordersService.updateStatus(id, body.status, req.user.tenantId);
    }
}

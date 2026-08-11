import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_FULL_ACCESS_ROLES } from '../auth/roles';
import { DeliveryCustomerService } from './delivery-customer.service';
import { CreateCustomerAddressDto, ResolveDeliveryCustomerDto, UpdateCustomerAddressDto } from './dto/delivery-customer.dto';

@Controller('admin/api/delivery/customers')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_FULL_ACCESS_ROLES)
export class DeliveryCustomerController {
    constructor(private readonly customerService: DeliveryCustomerService) { }

    @Post('resolve')
    resolve(@Request() request: any, @Body() body: ResolveDeliveryCustomerDto) {
        return this.customerService.resolveCustomer(request.user.tenantId, body.phone);
    }

    @Get(':customerId')
    getCustomer(@Request() request: any, @Param('customerId') customerId: string) {
        return this.customerService.getCustomer(request.user.tenantId, customerId);
    }

    @Get(':customerId/addresses')
    listAddresses(@Request() request: any, @Param('customerId') customerId: string) {
        return this.customerService.listAddresses(request.user.tenantId, customerId);
    }

    @Post(':customerId/addresses')
    createAddress(@Request() request: any, @Param('customerId') customerId: string, @Body() body: CreateCustomerAddressDto) {
        return this.customerService.createAddress(request.user.tenantId, customerId, body);
    }

    @Put(':customerId/addresses/:addressId')
    @Patch(':customerId/addresses/:addressId')
    updateAddress(
        @Request() request: any,
        @Param('customerId') customerId: string,
        @Param('addressId') addressId: string,
        @Body() body: UpdateCustomerAddressDto,
    ) {
        return this.customerService.updateAddress(request.user.tenantId, customerId, addressId, body);
    }

    @Delete(':customerId/addresses/:addressId')
    removeAddress(@Request() request: any, @Param('customerId') customerId: string, @Param('addressId') addressId: string) {
        return this.customerService.removeAddress(request.user.tenantId, customerId, addressId);
    }
}

import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, UnauthorizedException } from '@nestjs/common';

import { DeliveryCustomerService } from './delivery-customer.service';
import { CreateCustomerAddressDto, ResolveDeliveryCustomerDto, UpdateCustomerAddressDto } from './dto/delivery-customer.dto';

@Controller('admin/api/internal/delivery/customers')
export class DeliveryCustomerInternalController {
    constructor(private readonly customerService: DeliveryCustomerService) { }

    @Post('resolve')
    resolve(@Headers('x-internal-token') token: string, @Body() body: ResolveDeliveryCustomerDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.customerService.resolveCustomer(body.tenant_id, body.phone);
    }

    @Get(':customerId/addresses')
    listAddresses(@Headers('x-internal-token') token: string, @Param('customerId') customerId: string, @Headers('x-tenant-id') tenantId?: string) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.customerService.listAddresses(tenantId, customerId);
    }

    @Post(':customerId/addresses')
    createAddress(
        @Headers('x-internal-token') token: string,
        @Headers('x-tenant-id') tenantId: string,
        @Param('customerId') customerId: string,
        @Body() body: CreateCustomerAddressDto,
    ) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.customerService.createAddress(tenantId, customerId, body);
    }

    @Put(':customerId/addresses/:addressId')
    @Patch(':customerId/addresses/:addressId')
    updateAddress(
        @Headers('x-internal-token') token: string,
        @Headers('x-tenant-id') tenantId: string,
        @Param('customerId') customerId: string,
        @Param('addressId') addressId: string,
        @Body() body: UpdateCustomerAddressDto,
    ) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.customerService.updateAddress(tenantId, customerId, addressId, body);
    }

    @Delete(':customerId/addresses/:addressId')
    removeAddress(
        @Headers('x-internal-token') token: string,
        @Headers('x-tenant-id') tenantId: string,
        @Param('customerId') customerId: string,
        @Param('addressId') addressId: string,
    ) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.customerService.removeAddress(tenantId, customerId, addressId);
    }

    @Post(':customerId/addresses/:addressId/use')
    markUsed(
        @Headers('x-internal-token') token: string,
        @Headers('x-tenant-id') tenantId: string,
        @Param('customerId') customerId: string,
        @Param('addressId') addressId: string,
    ) {
        this.assertInternalToken(token);
        if (!tenantId) throw new UnauthorizedException('x-tenant-id is required');
        return this.customerService.markUsed(tenantId, customerId, addressId);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) {
            throw new UnauthorizedException('invalid internal token');
        }
    }
}

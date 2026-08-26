import { Body, Controller, Get, Patch, Post, Param, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_MENU_READ_ROLES } from '../auth/roles';
import { TENANT_FULL_ACCESS_ROLES } from '../auth/roles';
import { RetailService } from './retail.service';
import { CreateRetailCategoryDto } from './dto/create-retail-category.dto';
import { CreateRetailProductDto } from './dto/create-retail-product.dto';

/**
 * Tenant-scoped Loja boundary. Product/category writes are limited to the
 * tenant's full-access roles and always use the PICKING destination.
 */
@Controller('admin/api/retail')
@UseGuards(JwtAuthGuard)
export class RetailController {
    constructor(private readonly retailService: RetailService) { }

    @Get('workspace')
    @Roles(...TENANT_MENU_READ_ROLES)
    getWorkspace(@Request() req) {
        return this.retailService.getWorkspace(req.user.tenantId);
    }

    @Post('catalog/categories')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    createCategory(@Request() req, @Body() body: CreateRetailCategoryDto) {
        return this.retailService.createCategory(req.user.tenantId, body);
    }

    @Post('catalog/products')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    createProduct(@Request() req, @Body() body: CreateRetailProductDto) {
        return this.retailService.createProduct(req.user.tenantId, body);
    }

    @Patch('catalog/products/:id')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    updateProduct(@Request() req, @Param('id') id: string, @Body() body: CreateRetailProductDto) {
        return this.retailService.updateProduct(req.user.tenantId, id, body);
    }

    @Post('fulfillments/:id/transition')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    transitionFulfillment(@Request() req, @Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.retailService.transitionFulfillment(req.user.tenantId, id, String(body?.status || ''), Number(body?.expected_version || 0) || undefined);
    }
}

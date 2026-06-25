import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_PURCHASE_ROLES } from '../auth/roles';
import { CreatePurchaseEntryDto } from './dto/create-purchase-entry.dto';
import { UpdatePurchaseEntryDto } from './dto/update-purchase-entry.dto';
import { PurchasesService } from './purchases.service';

@Controller('admin/api/purchases')
@UseGuards(JwtAuthGuard)
export class PurchasesController {
    constructor(private readonly purchasesService: PurchasesService) { }

    @Get()
    @Roles(...TENANT_PURCHASE_ROLES)
    findAll(
        @Request() req,
        @Query('q') q?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.purchasesService.findAll(req.user.tenantId, { q, from, to });
    }

    @Get(':id')
    @Roles(...TENANT_PURCHASE_ROLES)
    findOne(@Request() req, @Param('id') id: string) {
        return this.purchasesService.findOne(req.user.tenantId, id);
    }

    @Post()
    @Roles(...TENANT_PURCHASE_ROLES)
    create(@Request() req, @Body() body: CreatePurchaseEntryDto) {
        const data: Record<string, unknown> = {
            supplierName: body.supplier_name,
            items: body.items || [],
            createdByUserId: req.user.id,
            createdByUserName: req.user.name,
        };

        if (body.supplier_document !== undefined) data.supplierDocument = body.supplier_document || null;
        if (body.invoice_number !== undefined) data.invoiceNumber = body.invoice_number || null;
        if (body.purchase_date !== undefined) data.purchaseDate = body.purchase_date || undefined;
        if (body.notes !== undefined) data.notes = body.notes || null;

        return this.purchasesService.create(req.user.tenantId, data as any);
    }

    @Put(':id')
    @Roles(...TENANT_PURCHASE_ROLES)
    update(@Request() req, @Param('id') id: string, @Body() body: UpdatePurchaseEntryDto) {
        const data: Record<string, unknown> = {};

        if (body.supplier_name !== undefined) data.supplierName = body.supplier_name;
        if (body.supplier_document !== undefined) data.supplierDocument = body.supplier_document || null;
        if (body.invoice_number !== undefined) data.invoiceNumber = body.invoice_number || null;
        if (body.purchase_date !== undefined) data.purchaseDate = body.purchase_date || undefined;
        if (body.notes !== undefined) data.notes = body.notes || null;
        if (body.items !== undefined) data.items = body.items;

        return this.purchasesService.update(req.user.tenantId, id, data as any);
    }

    @Delete(':id')
    @Roles(...TENANT_PURCHASE_ROLES)
    remove(@Request() req, @Param('id') id: string) {
        return this.purchasesService.remove(req.user.tenantId, id);
    }
}

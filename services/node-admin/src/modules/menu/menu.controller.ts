import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { MenuService } from './menu.service';

@Controller('admin/api/menu')
export class MenuController {
    constructor(private readonly menuService: MenuService) { }

    @Get()
    findAll(
        @Query('tenant_id') tenantId: string,
        @Query('category_id') categoryId?: string,
    ) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.menuService.findAll(tid, categoryId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.menuService.findOne(id);
    }

    @Post()
    create(@Body() body: any) {
        const tenantId = body.tenant_id || process.env.DEFAULT_TENANT_ID || '';
        return this.menuService.create(tenantId, {
            name: body.name,
            description: body.description,
            price: body.price,
            categoryId: body.category_id,
            destination: body.destination || 'KITCHEN',
            prepTimeMinutes: body.prep_time_minutes || 15,
            imageUrl: body.image_url,
            available: body.available !== false,
            displayOrder: body.display_order || 0,
        });
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.menuService.update(id, {
            name: body.name,
            description: body.description,
            price: body.price,
            categoryId: body.category_id,
            destination: body.destination,
            prepTimeMinutes: body.prep_time_minutes,
            imageUrl: body.image_url,
            available: body.available,
            displayOrder: body.display_order,
        });
    }

    @Patch(':id/toggle')
    toggleAvailability(@Param('id') id: string) {
        return this.menuService.toggleAvailability(id);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.menuService.remove(id);
    }
}

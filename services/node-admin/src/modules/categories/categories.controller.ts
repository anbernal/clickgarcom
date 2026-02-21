import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('admin/api/categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Get()
    findAll(@Query('tenant_id') tenantId?: string) {
        const tid = tenantId || process.env.DEFAULT_TENANT_ID || '';
        return this.categoriesService.findAll(tid);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.categoriesService.findOne(id);
    }

    @Post()
    create(@Body() body: any) {
        const tenantId = body.tenant_id || process.env.DEFAULT_TENANT_ID || '';
        return this.categoriesService.create(tenantId, {
            name: body.name,
            description: body.description,
            displayOrder: body.display_order || 0,
            active: body.active !== false,
        });
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.categoriesService.update(id, {
            name: body.name,
            description: body.description,
            displayOrder: body.display_order,
            active: body.active,
        });
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.categoriesService.remove(id);
    }
}

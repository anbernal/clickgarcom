import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';

@Controller('admin/api/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Get()
    findAll(@Request() req) {
        return this.categoriesService.findAll(req.user.tenantId);
    }

    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.categoriesService.findOne(id, req.user.tenantId);
    }

    @Post()
    create(@Request() req, @Body() body: any) {
        return this.categoriesService.create(req.user.tenantId, {
            name: body.name,
            description: body.description,
            imageUrl: body.image_url,
            displayOrder: body.display_order || 0,
            active: body.active !== false,
        });
    }

    @Put(':id')
    update(@Request() req, @Param('id') id: string, @Body() body: any) {
        return this.categoriesService.update(id, req.user.tenantId, {
            name: body.name,
            description: body.description,
            imageUrl: body.image_url,
            displayOrder: body.display_order,
            active: body.active,
        });
    }

    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        return this.categoriesService.remove(id, req.user.tenantId);
    }
}

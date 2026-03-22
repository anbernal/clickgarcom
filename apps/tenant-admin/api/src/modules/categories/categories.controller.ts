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
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Roles } from '../auth/roles.decorator';
import { TENANT_MENU_READ_ROLES, TENANT_MENU_WRITE_ROLES } from '../auth/roles';

@Controller('admin/api/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    @Get()
    @Roles(...TENANT_MENU_READ_ROLES)
    findAll(@Request() req) {
        return this.categoriesService.findAll(req.user.tenantId);
    }

    @Get(':id')
    @Roles(...TENANT_MENU_READ_ROLES)
    findOne(@Request() req, @Param('id') id: string) {
        return this.categoriesService.findOne(id, req.user.tenantId);
    }

    @Post()
    @Roles(...TENANT_MENU_WRITE_ROLES)
    create(@Request() req, @Body() body: CreateCategoryDto) {
        return this.categoriesService.create(req.user.tenantId, {
            name: body.name,
            description: body.description,
            imageUrl: body.image_url,
            displayOrder: body.display_order || 0,
            active: body.active !== false,
        });
    }

    @Put(':id')
    @Roles(...TENANT_MENU_WRITE_ROLES)
    update(@Request() req, @Param('id') id: string, @Body() body: UpdateCategoryDto) {
        return this.categoriesService.update(id, req.user.tenantId, {
            name: body.name,
            description: body.description,
            imageUrl: body.image_url,
            displayOrder: body.display_order,
            active: body.active,
        });
    }

    @Delete(':id')
    @Roles(...TENANT_MENU_WRITE_ROLES)
    remove(@Request() req, @Param('id') id: string) {
        return this.categoriesService.remove(id, req.user.tenantId);
    }
}

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
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MenuService } from './menu.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { Roles } from '../auth/roles.decorator';
import { TENANT_MENU_READ_ROLES, TENANT_MENU_WRITE_ROLES } from '../auth/roles';

@Controller('admin/api/menu')
@UseGuards(JwtAuthGuard)
export class MenuController {
    constructor(private readonly menuService: MenuService) { }

    @Get()
    @Roles(...TENANT_MENU_READ_ROLES)
    findAll(
        @Request() req,
        @Query('category_id') categoryId?: string,
    ) {
        return this.menuService.findAll(req.user.tenantId, categoryId);
    }

    @Get(':id')
    @Roles(...TENANT_MENU_READ_ROLES)
    findOne(@Request() req, @Param('id') id: string) {
        return this.menuService.findOne(id, req.user.tenantId);
    }

    @Post()
    @Roles(...TENANT_MENU_WRITE_ROLES)
    create(@Request() req, @Body() body: CreateMenuItemDto) {
        return this.menuService.create(req.user.tenantId, {
            name: body.name,
            description: body.description,
            price: body.price,
            categoryId: body.category_id,
            destination: body.destination || 'KITCHEN',
            prepTimeMinutes: body.prep_time_minutes || 15,
            imageUrl: body.image_url,
            whatsappShortName: body.whatsapp_short_name,
            whatsappShortDescription: body.whatsapp_short_description,
            available: body.available !== false,
            displayOrder: body.display_order || 0,
        });
    }

    @Put(':id')
    @Roles(...TENANT_MENU_WRITE_ROLES)
    update(@Request() req, @Param('id') id: string, @Body() body: UpdateMenuItemDto) {
        return this.menuService.update(id, req.user.tenantId, {
            name: body.name,
            description: body.description,
            price: body.price,
            categoryId: body.category_id,
            destination: body.destination,
            prepTimeMinutes: body.prep_time_minutes,
            imageUrl: body.image_url,
            whatsappShortName: body.whatsapp_short_name,
            whatsappShortDescription: body.whatsapp_short_description,
            available: body.available,
            displayOrder: body.display_order,
        });
    }

    @Patch(':id/toggle')
    @Roles(...TENANT_MENU_WRITE_ROLES)
    toggleAvailability(@Request() req, @Param('id') id: string) {
        return this.menuService.toggleAvailability(id, req.user.tenantId);
    }

    @Delete(':id')
    @Roles(...TENANT_MENU_WRITE_ROLES)
    remove(@Request() req, @Param('id') id: string) {
        return this.menuService.remove(id, req.user.tenantId);
    }
}

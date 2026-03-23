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
import { MenuItem } from '../../entities/menu-item.entity';

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
            costPrice: body.cost_price ?? null,
            categoryId: body.category_id,
            destination: body.destination || 'KITCHEN',
            prepTimeMinutes: body.prep_time_minutes || 15,
            imageUrl: body.image_url,
            whatsappShortName: body.whatsapp_short_name,
            whatsappShortDescription: body.whatsapp_short_description,
            available: body.available !== false,
            itemType: body.item_type || 'STANDARD',
            trackStock: body.track_stock === true,
            stockQuantity: body.stock_quantity ?? null,
            lowStockThreshold: body.low_stock_threshold ?? null,
            availabilityWindows: body.availability_windows?.map((window) => ({
                dayOfWeek: window.day_of_week,
                startTime: window.start_time,
                endTime: window.end_time,
            })) ?? [],
            optionGroups: body.option_groups?.map((group, groupIndex) => ({
                name: group.name,
                description: group.description ?? null,
                required: group.required === true,
                min_select: group.min_select ?? (group.required === true ? 1 : 0),
                max_select: group.max_select ?? Math.max(group.required === true ? 1 : 0, group.options?.length || 1),
                display_order: group.display_order ?? groupIndex,
                options: (group.options || []).map((option, optionIndex) => ({
                    name: option.name,
                    description: option.description ?? null,
                    price_delta: option.price_delta ?? 0,
                    available: option.available !== false,
                    display_order: option.display_order ?? optionIndex,
                })),
            })) ?? [],
            comboComponents: body.combo_components?.map((component, componentIndex) => ({
                menu_item_id: component.menu_item_id,
                quantity: component.quantity ?? 1,
                display_order: component.display_order ?? componentIndex,
            })) ?? [],
            displayOrder: body.display_order || 0,
        });
    }

    @Put(':id')
    @Roles(...TENANT_MENU_WRITE_ROLES)
    update(@Request() req, @Param('id') id: string, @Body() body: UpdateMenuItemDto) {
        const data: Partial<MenuItem> = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.description !== undefined) data.description = body.description;
        if (body.price !== undefined) data.price = body.price;
        if (body.cost_price !== undefined) data.costPrice = body.cost_price;
        if (body.category_id !== undefined) data.categoryId = body.category_id;
        if (body.destination !== undefined) data.destination = body.destination;
        if (body.prep_time_minutes !== undefined) data.prepTimeMinutes = body.prep_time_minutes;
        if (body.image_url !== undefined) data.imageUrl = body.image_url;
        if (body.whatsapp_short_name !== undefined) data.whatsappShortName = body.whatsapp_short_name;
        if (body.whatsapp_short_description !== undefined) data.whatsappShortDescription = body.whatsapp_short_description;
        if (body.available !== undefined) data.available = body.available;
        if (body.item_type !== undefined) data.itemType = body.item_type;
        if (body.track_stock !== undefined) data.trackStock = body.track_stock;
        if (body.stock_quantity !== undefined) data.stockQuantity = body.stock_quantity;
        if (body.low_stock_threshold !== undefined) data.lowStockThreshold = body.low_stock_threshold;
        if (body.availability_windows !== undefined) {
            data.availabilityWindows = body.availability_windows?.map((window) => ({
                dayOfWeek: window.day_of_week,
                startTime: window.start_time,
                endTime: window.end_time,
            })) ?? [];
        }
        if (body.option_groups !== undefined) {
            data.optionGroups = body.option_groups?.map((group, groupIndex) => ({
                name: group.name,
                description: group.description ?? null,
                required: group.required === true,
                min_select: group.min_select ?? (group.required === true ? 1 : 0),
                max_select: group.max_select ?? Math.max(group.required === true ? 1 : 0, group.options?.length || 1),
                display_order: group.display_order ?? groupIndex,
                options: (group.options || []).map((option, optionIndex) => ({
                    name: option.name,
                    description: option.description ?? null,
                    price_delta: option.price_delta ?? 0,
                    available: option.available !== false,
                    display_order: option.display_order ?? optionIndex,
                })),
            })) ?? [];
        }
        if (body.combo_components !== undefined) {
            data.comboComponents = body.combo_components?.map((component, componentIndex) => ({
                menu_item_id: component.menu_item_id,
                quantity: component.quantity ?? 1,
                display_order: component.display_order ?? componentIndex,
            })) ?? [];
        }
        if (body.display_order !== undefined) data.displayOrder = body.display_order;
        return this.menuService.update(id, req.user.tenantId, data);
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

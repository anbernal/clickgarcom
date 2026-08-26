import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Tenant } from '../../entities/tenant.entity';
import { v4 as uuidv4 } from 'uuid';

type MenuAvailabilityWindow = {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
};

type MenuItemOption = {
    name: string;
    description: string | null;
    priceDelta: number;
    available: boolean;
    displayOrder: number;
};

type MenuItemOptionGroup = {
    name: string;
    description: string | null;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    displayOrder: number;
    options: MenuItemOption[];
};

type MenuItemComboComponent = {
    menuItemId: string;
    quantity: number;
    displayOrder: number;
    menuItemName?: string | null;
    menuItemPrice?: number | null;
};

const FOOD_DESTINATIONS = ['KITCHEN', 'BAR'];

@Injectable()
export class MenuService {
    constructor(
        @InjectRepository(MenuItem)
        private readonly menuItemRepo: Repository<MenuItem>,
        @InjectRepository(MenuCategory)
        private readonly categoryRepo: Repository<MenuCategory>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
    ) { }

    async findPublicMenuBySlug(rawSlug: string) {
        const slug = String(rawSlug || '').trim().toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) {
            throw new BadRequestException('Identificador do restaurante inválido.');
        }

        const tenant = await this.tenantRepo.findOne({ where: { slug, active: true } });
        if (!tenant) throw new NotFoundException('Cardápio não encontrado.');

        const [categories, menuItems] = await Promise.all([
            this.categoryRepo.find({
                where: { tenantId: tenant.id, active: true },
                order: { displayOrder: 'ASC', name: 'ASC' },
            }),
            this.menuItemRepo
                .createQueryBuilder('item')
                .where('item.tenant_id = :tenantId', { tenantId: tenant.id })
                .andWhere('item.available = TRUE')
                .andWhere('item.destination IN (:...destinations)', { destinations: FOOD_DESTINATIONS })
                .orderBy('item.display_order', 'ASC')
                .addOrderBy('item.name', 'ASC')
                .getMany(),
        ]);
        const serializedItems = (await this.serializeMenuItems(tenant.id, menuItems))
            .filter((item) => item?.isCurrentlyAvailable === true);
        const itemsByCategory = new Map<string, any[]>();
        for (const item of serializedItems) {
            const categoryId = String(item?.categoryId || '');
            if (!categoryId) continue;
            const current = itemsByCategory.get(categoryId) || [];
            current.push(this.toPublicMenuItem(item));
            itemsByCategory.set(categoryId, current);
        }

        const settings = tenant.settings?.digital_menu || {};
        const publicCategories = categories
            .map((category) => ({
                id: category.id,
                name: category.name,
                description: category.description,
                image_url: normalizePublicAssetUrl(category.imageUrl),
                items: itemsByCategory.get(category.id) || [],
            }))
            .filter((category) => category.items.length > 0);

        return {
            restaurant: {
                name: tenant.name,
                slug: tenant.slug,
                is_open: tenant.isOpen,
                logo_url: normalizePublicAssetUrl(settings.logo_url),
                cover_url: normalizePublicAssetUrl(settings.cover_url),
                description: normalizePublicText(settings.description, 240),
            },
            theme: {
                primary_color: normalizeHexColor(settings.primary_color, '#153f34'),
                accent_color: normalizeHexColor(settings.accent_color, '#ef6a45'),
            },
            categories: publicCategories,
            item_count: publicCategories.reduce((total, category) => total + category.items.length, 0),
            updated_at: tenant.updatedAt,
        };
    }

    async findAll(tenantId: string, categoryId?: string) {
        const query = this.menuItemRepo
            .createQueryBuilder('item')
            .leftJoinAndSelect('item.category', 'category')
            .where('item.tenant_id = :tenantId', { tenantId })
            .andWhere('item.destination IN (:...destinations)', { destinations: FOOD_DESTINATIONS })
            .orderBy('item.display_order', 'ASC')
            .addOrderBy('item.name', 'ASC');

        if (categoryId) {
            query.andWhere('item.category_id = :categoryId', { categoryId });
        }

        const items = await query.getMany();

        return this.serializeMenuItems(tenantId, items);
    }

    async findOne(id: string, tenantId: string) {
        const item = await this.menuItemRepo.findOne({
            where: { id, tenantId },
            relations: ['category'],
        });

        if (!item || !isFoodDestination(item.destination)) {
            return null;
        }

        const [serialized] = await this.serializeMenuItems(tenantId, [item]);
        return serialized || null;
    }

    async create(tenantId: string, data: Partial<MenuItem>) {
        const item = this.menuItemRepo.create({
            ...this.normalizeWriteData(data),
            id: uuidv4(),
            tenantId,
        });
        const saved = await this.menuItemRepo.save(item);
        return this.findOne(saved.id, tenantId);
    }

    async update(id: string, tenantId: string, data: Partial<MenuItem>) {
        const existing = await this.menuItemRepo.findOne({ where: { id, tenantId } });
        if (!existing || !isFoodDestination(existing.destination)) {
            return null;
        }
        await this.menuItemRepo.update({ id, tenantId }, this.normalizeWriteData(data));
        return this.findOne(id, tenantId);
    }

    async toggleAvailability(id: string, tenantId: string) {
        const item = await this.menuItemRepo.findOne({ where: { id, tenantId } });
        if (!item || !isFoodDestination(item.destination)) return null;
        item.available = !item.available;
        const saved = await this.menuItemRepo.save(item);
        return this.findOne(saved.id, tenantId);
    }

    async remove(id: string, tenantId: string) {
        const item = await this.menuItemRepo.findOne({ where: { id, tenantId } });
        if (!item || !isFoodDestination(item.destination)) {
            return { affected: 0 };
        }
        return this.menuItemRepo.delete({ id, tenantId });
    }

    private async serializeMenuItems(tenantId: string, items: MenuItem[]) {
        const comboComponentIds = new Set<string>();
        for (const item of items) {
            for (const component of normalizeComboComponents(item.comboComponents)) {
                comboComponentIds.add(component.menuItemId);
            }
        }

        const comboItems = comboComponentIds.size > 0
            ? await this.menuItemRepo.find({
                where: {
                    tenantId,
                    id: In(Array.from(comboComponentIds)),
                    destination: In(FOOD_DESTINATIONS),
                },
            })
            : [];

        const comboItemMap = new Map(comboItems.map((item) => [item.id, item]));
        return items.map((item) => this.serializeMenuItem(item, comboItemMap));
    }

    private normalizeWriteData(data: Partial<MenuItem>): Partial<MenuItem> {
        const normalized: Partial<MenuItem> = { ...data };

        // This service backs the restaurant menu. Retail products use PICKING and
        // are managed through the RETAIL domain, so a food-menu request can never
        // move an item into that catalog by accident.
        if (Object.prototype.hasOwnProperty.call(data, 'destination')) {
            normalized.destination = isFoodDestination(data.destination)
                ? String(data.destination).trim().toUpperCase()
                : 'KITCHEN';
        }

        if (Object.prototype.hasOwnProperty.call(data, 'itemType')) {
            normalized.itemType = normalizeItemType(data.itemType);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'trackStock')) {
            normalized.trackStock = data.trackStock === true;
        }

        if (normalized.trackStock === false) {
            normalized.stockQuantity = null;
            normalized.lowStockThreshold = null;
        } else {
            if (Object.prototype.hasOwnProperty.call(data, 'stockQuantity')) {
                normalized.stockQuantity = data.stockQuantity === null || data.stockQuantity === undefined
                    ? 0
                    : Number(data.stockQuantity);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'lowStockThreshold')) {
                normalized.lowStockThreshold = data.lowStockThreshold === null || data.lowStockThreshold === undefined
                    ? null
                    : Number(data.lowStockThreshold);
            }
        }

        if (Object.prototype.hasOwnProperty.call(data, 'availabilityWindows')) {
            normalized.availabilityWindows = normalizeAvailabilityWindows(data.availabilityWindows) ?? null;
        }

        if (Object.prototype.hasOwnProperty.call(data, 'optionGroups')) {
            normalized.optionGroups = normalizeOptionGroups(data.optionGroups) ?? null;
        }

        if (Object.prototype.hasOwnProperty.call(data, 'comboComponents')) {
            normalized.comboComponents = normalizeComboComponents(data.comboComponents) ?? null;
        }

        if (normalized.itemType === 'STANDARD') {
            normalized.comboComponents = null;
        }

        return normalized;
    }

    private toPublicMenuItem(item: any) {
        const optionGroups = normalizeOptionGroups(item.optionGroups);
        return {
            id: item.id,
            category_id: item.categoryId,
            name: item.name,
            description: item.description || '',
            price: Number(item.price || 0),
            image_url: normalizePublicAssetUrl(item.imageUrl),
            item_type: item.itemType,
            prep_time_minutes: Number(item.prepTimeMinutes || 0),
            has_options: Number(item.optionGroupCount || optionGroups?.length || 0) > 0,
            option_groups: optionGroups || [],
        };
    }

    private serializeMenuItem(item: MenuItem | null, comboItemMap: Map<string, MenuItem>) {
        if (!item) {
            return null;
        }

        const availabilityWindows = normalizeAvailabilityWindows(item.availabilityWindows);
        const optionGroups = normalizeOptionGroups(item.optionGroups);
        const comboComponents = normalizeComboComponents(item.comboComponents)
            .map((component) => ({
                ...component,
                menuItemName: comboItemMap.get(component.menuItemId)?.name || null,
                menuItemPrice: comboItemMap.get(component.menuItemId)?.price ?? null,
            }));

        const currentState = evaluateMenuItemAvailability({
            available: item.available,
            trackStock: item.trackStock,
            stockQuantity: item.stockQuantity,
            lowStockThreshold: item.lowStockThreshold,
            availabilityWindows,
        });

        return {
            ...item,
            itemType: normalizeItemType(item.itemType),
            availabilityWindows,
            optionGroups,
            comboComponents,
            isCurrentlyAvailable: currentState.isCurrentlyAvailable,
            currentAvailabilityStatus: currentState.status,
            currentAvailabilityLabel: currentState.label,
            unavailableReason: currentState.unavailableReason,
            availabilitySummary: buildAvailabilitySummary(availabilityWindows),
            stockLabel: buildStockLabel(item.trackStock, item.stockQuantity, item.lowStockThreshold),
            optionGroupCount: optionGroups?.length || 0,
            comboComponentCount: comboComponents.length,
            configurationSummary: buildConfigurationSummary(normalizeItemType(item.itemType), optionGroups, comboComponents),
        };
    }
}

function normalizePublicAssetUrl(rawValue: unknown): string | null {
    const value = String(rawValue || '').trim();
    if (!value || value.length > 2048) return null;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch (_error) {
        return null;
    }
}

function normalizeHexColor(rawValue: unknown, fallback: string): string {
    const value = String(rawValue || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function normalizePublicText(rawValue: unknown, maxLength: number): string {
    return String(rawValue || '').trim().slice(0, maxLength);
}

function normalizeItemType(value: unknown) {
    return String(value || 'STANDARD').trim().toUpperCase() === 'COMBO' ? 'COMBO' : 'STANDARD';
}

function isFoodDestination(value: unknown): boolean {
    return FOOD_DESTINATIONS.includes(String(value || '').trim().toUpperCase());
}

function normalizeAvailabilityWindows(
    windows?: Array<{ dayOfWeek: number; startTime: string; endTime: string }> | null,
): MenuAvailabilityWindow[] | null {
    if (!Array.isArray(windows) || windows.length === 0) {
        return null;
    }

    const normalized = windows
        .map((window) => ({
            dayOfWeek: Number(window?.dayOfWeek),
            startTime: String(window?.startTime || '').slice(0, 5),
            endTime: String(window?.endTime || '').slice(0, 5),
        }))
        .filter((window) => (
            Number.isInteger(window.dayOfWeek)
            && window.dayOfWeek >= 0
            && window.dayOfWeek <= 6
            && isClockValue(window.startTime)
            && isClockValue(window.endTime)
        ))
        .sort((left, right) => {
            if (left.dayOfWeek === right.dayOfWeek) {
                return left.startTime.localeCompare(right.startTime);
            }
            return left.dayOfWeek - right.dayOfWeek;
        });

    return normalized.length > 0 ? normalized : null;
}

function normalizeOptionGroups(input?: Array<Record<string, unknown>> | null): MenuItemOptionGroup[] | null {
    if (!Array.isArray(input) || input.length === 0) {
        return null;
    }

    const groups = input
        .map((rawGroup, groupIndex) => {
            const options = Array.isArray(rawGroup?.options)
                ? rawGroup.options
                    .map((rawOption: Record<string, unknown>, optionIndex) => ({
                        name: String(rawOption?.name || '').trim(),
                        description: normalizeText(rawOption?.description),
                        priceDelta: Number(rawOption?.priceDelta ?? rawOption?.price_delta ?? 0),
                        available: rawOption?.available !== false,
                        displayOrder: normalizeInt(rawOption?.displayOrder ?? rawOption?.display_order, optionIndex, 0),
                    }))
                    .filter((option) => option.name !== '' && option.priceDelta >= 0)
                    .sort((left, right) => left.displayOrder - right.displayOrder)
                : [];

            const name = String(rawGroup?.name || '').trim();
            const required = rawGroup?.required === true;
            const minSelect = normalizeInt(rawGroup?.minSelect ?? rawGroup?.min_select, required ? 1 : 0, 0);
            const maxSelect = normalizeInt(rawGroup?.maxSelect ?? rawGroup?.max_select, Math.max(minSelect || 1, options.length || 1), 1);

            if (!name || options.length === 0) {
                return null;
            }

            return {
                name,
                description: normalizeText(rawGroup?.description),
                required,
                minSelect,
                maxSelect: Math.max(maxSelect, minSelect),
                displayOrder: normalizeInt(rawGroup?.displayOrder ?? rawGroup?.display_order, groupIndex, 0),
                options,
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.displayOrder - right.displayOrder) as MenuItemOptionGroup[];

    return groups.length > 0 ? groups : null;
}

function normalizeComboComponents(input?: Array<Record<string, unknown>> | null): MenuItemComboComponent[] {
    if (!Array.isArray(input) || input.length === 0) {
        return [];
    }

    return input
        .map((rawComponent, index) => ({
            menuItemId: String(rawComponent?.menuItemId ?? rawComponent?.menu_item_id ?? '').trim(),
            quantity: normalizeInt(rawComponent?.quantity, 1, 1),
            displayOrder: normalizeInt(rawComponent?.displayOrder ?? rawComponent?.display_order, index, 0),
        }))
        .filter((component) => component.menuItemId !== '')
        .sort((left, right) => left.displayOrder - right.displayOrder);
}

function evaluateMenuItemAvailability(input: {
    available: boolean;
    trackStock: boolean;
    stockQuantity: number | null;
    lowStockThreshold: number | null;
    availabilityWindows: MenuAvailabilityWindow[] | null;
}) {
    if (!input.available) {
        return {
            isCurrentlyAvailable: false,
            status: 'manual_inactive',
            label: 'Inativo manual',
            unavailableReason: 'Item desativado manualmente no cardápio.',
        };
    }

    if (input.trackStock && Number(input.stockQuantity ?? 0) <= 0) {
        return {
            isCurrentlyAvailable: false,
            status: 'out_of_stock',
            label: 'Sem estoque',
            unavailableReason: 'Item sem estoque disponível para venda.',
        };
    }

    if (input.availabilityWindows?.length && !isWithinAvailabilityWindows(input.availabilityWindows, new Date())) {
        return {
            isCurrentlyAvailable: false,
            status: 'scheduled_unavailable',
            label: 'Fora do horário',
            unavailableReason: 'Item fora da janela de venda configurada.',
        };
    }

    if (
        input.trackStock
        && input.lowStockThreshold !== null
        && input.lowStockThreshold !== undefined
        && Number(input.stockQuantity ?? 0) <= Number(input.lowStockThreshold)
    ) {
        return {
            isCurrentlyAvailable: true,
            status: 'low_stock',
            label: 'Estoque baixo',
            unavailableReason: null,
        };
    }

    return {
        isCurrentlyAvailable: true,
        status: 'available',
        label: 'Ativo agora',
        unavailableReason: null,
    };
}

function isWithinAvailabilityWindows(windows: MenuAvailabilityWindow[], now: Date) {
    const currentDay = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let hasValidWindow = false;

    for (const window of windows) {
        const startMinutes = toClockMinutes(window.startTime);
        const endMinutes = toClockMinutes(window.endTime);
        if (startMinutes === null || endMinutes === null) {
            continue;
        }

        hasValidWindow = true;

        if (startMinutes === endMinutes && currentDay === window.dayOfWeek) {
            return true;
        }

        if (startMinutes < endMinutes) {
            if (currentDay === window.dayOfWeek && currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                return true;
            }
            continue;
        }

        if (currentDay === window.dayOfWeek && currentMinutes >= startMinutes) {
            return true;
        }

        if (((currentDay + 6) % 7) === window.dayOfWeek && currentMinutes <= endMinutes) {
            return true;
        }
    }

    return hasValidWindow ? false : true;
}

function buildAvailabilitySummary(windows: MenuAvailabilityWindow[] | null) {
    if (!windows?.length) {
        return 'Sempre disponível';
    }

    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    return windows
        .map((window) => `${dayLabels[window.dayOfWeek]} ${window.startTime}-${window.endTime}`)
        .join(' · ');
}

function buildStockLabel(trackStock: boolean, stockQuantity: number | null, lowStockThreshold: number | null) {
    if (!trackStock) {
        return 'Controle de estoque desligado';
    }

    const quantity = Number(stockQuantity ?? 0);
    if (lowStockThreshold !== null && lowStockThreshold !== undefined) {
        return `Estoque atual: ${quantity} · alerta em ${lowStockThreshold}`;
    }

    return `Estoque atual: ${quantity}`;
}

function buildConfigurationSummary(
    itemType: string,
    optionGroups: MenuItemOptionGroup[] | null,
    comboComponents: MenuItemComboComponent[],
) {
    const parts = [];
    if (itemType === 'COMBO') {
        parts.push(`${comboComponents.length} item(ns) no combo`);
    }
    if (optionGroups?.length) {
        parts.push(`${optionGroups.length} grupo(s) de opcionais`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Sem estruturas adicionais';
}

function normalizeText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized === '' ? null : normalized;
}

function normalizeInt(value: unknown, fallback: number, min: number) {
    const normalized = Number.parseInt(String(value ?? fallback), 10);
    if (Number.isNaN(normalized)) {
        return fallback;
    }
    return Math.max(normalized, min);
}

function isClockValue(value: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
}

function toClockMinutes(value: string) {
    if (!isClockValue(value)) {
        return null;
    }

    const [hours, minutes] = value.split(':').map(Number);
    return (hours * 60) + minutes;
}

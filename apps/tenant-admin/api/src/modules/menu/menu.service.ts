import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { v4 as uuidv4 } from 'uuid';

type MenuAvailabilityWindow = {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
};

@Injectable()
export class MenuService {
    constructor(
        @InjectRepository(MenuItem)
        private readonly menuItemRepo: Repository<MenuItem>,
        @InjectRepository(MenuCategory)
        private readonly categoryRepo: Repository<MenuCategory>,
    ) { }

    async findAll(tenantId: string, categoryId?: string) {
        const where: any = { tenantId };
        if (categoryId) where.categoryId = categoryId;
        const items = await this.menuItemRepo.find({
            where,
            relations: ['category'],
            order: { displayOrder: 'ASC', name: 'ASC' },
        });
        return items.map((item) => this.serializeMenuItem(item));
    }

    async findOne(id: string, tenantId: string) {
        const item = await this.menuItemRepo.findOne({
            where: { id, tenantId },
            relations: ['category'],
        });
        return this.serializeMenuItem(item);
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
        await this.menuItemRepo.update({ id, tenantId }, this.normalizeWriteData(data));
        return this.findOne(id, tenantId);
    }

    async toggleAvailability(id: string, tenantId: string) {
        const item = await this.menuItemRepo.findOne({ where: { id, tenantId } });
        if (!item) return null;
        item.available = !item.available;
        const saved = await this.menuItemRepo.save(item);
        return this.findOne(saved.id, tenantId);
    }

    async remove(id: string, tenantId: string) {
        return this.menuItemRepo.delete({ id, tenantId });
    }

    private normalizeWriteData(data: Partial<MenuItem>): Partial<MenuItem> {
        const normalized: Partial<MenuItem> = { ...data };

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

        return normalized;
    }

    private serializeMenuItem(item: MenuItem | null) {
        if (!item) {
            return null;
        }

        const availabilityWindows = normalizeAvailabilityWindows(item.availabilityWindows);
        const currentState = evaluateMenuItemAvailability({
            available: item.available,
            trackStock: item.trackStock,
            stockQuantity: item.stockQuantity,
            lowStockThreshold: item.lowStockThreshold,
            availabilityWindows,
        });

        return {
            ...item,
            availabilityWindows,
            isCurrentlyAvailable: currentState.isCurrentlyAvailable,
            currentAvailabilityStatus: currentState.status,
            currentAvailabilityLabel: currentState.label,
            unavailableReason: currentState.unavailableReason,
            availabilitySummary: buildAvailabilitySummary(availabilityWindows),
            stockLabel: buildStockLabel(item.trackStock, item.stockQuantity, item.lowStockThreshold),
        };
    }
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

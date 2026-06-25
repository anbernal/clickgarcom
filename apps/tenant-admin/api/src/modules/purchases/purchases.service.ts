import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { PurchaseEntry, PurchaseEntryItem } from '../../entities/purchase-entry.entity';

type PurchaseEntryFilters = {
    q?: string;
    from?: string;
    to?: string;
};

type PurchaseEntryWriteData = {
    supplierName?: string;
    supplierDocument?: string | null;
    invoiceNumber?: string | null;
    purchaseDate?: string;
    notes?: string | null;
    items?: Array<Record<string, unknown>>;
    createdByUserId?: string | null;
    createdByUserName?: string | null;
};

type SerializedPurchaseEntry = {
    id: string;
    tenantId: string;
    supplierName: string;
    supplierDocument: string | null;
    invoiceNumber: string | null;
    purchaseDate: string;
    notes: string | null;
    items: PurchaseEntryItem[];
    itemCount: number;
    totalAmount: number;
    createdByUserId: string | null;
    createdByUserName: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

@Injectable()
export class PurchasesService {
    constructor(
        @InjectRepository(PurchaseEntry)
        private readonly purchaseRepo: Repository<PurchaseEntry>,
    ) { }

    async findAll(tenantId: string, filters: PurchaseEntryFilters = {}) {
        const items = await this.purchaseRepo.find({
            where: { tenantId },
            order: {
                purchaseDate: 'DESC',
                createdAt: 'DESC',
            },
        });

        const normalized = items
            .map((item) => this.serialize(item))
            .filter((item) => this.matchesFilters(item, filters));

        return normalized;
    }

    async findOne(tenantId: string, id: string) {
        const entry = await this.purchaseRepo.findOne({
            where: { id, tenantId },
        });

        return entry ? this.serialize(entry) : null;
    }

    async create(tenantId: string, data: PurchaseEntryWriteData) {
        const normalized = this.normalizeWriteData(data, true);
        const entry = this.purchaseRepo.create({
            id: uuidv4(),
            tenantId,
            ...normalized,
        });

        const saved = await this.purchaseRepo.save(entry);
        return this.serialize(saved);
    }

    async update(tenantId: string, id: string, data: PurchaseEntryWriteData) {
        const current = await this.purchaseRepo.findOne({ where: { id, tenantId } });
        if (!current) {
            throw new HttpException('Lançamento de compra não encontrado.', HttpStatus.NOT_FOUND);
        }

        const normalized = this.normalizeWriteData(data, false);
        const next = this.purchaseRepo.merge(current, normalized);
        const saved = await this.purchaseRepo.save(next);
        return this.serialize(saved);
    }

    async remove(tenantId: string, id: string) {
        const result = await this.purchaseRepo.delete({ id, tenantId });
        return {
            deleted: (result.affected || 0) > 0,
        };
    }

    private matchesFilters(entry: SerializedPurchaseEntry, filters: PurchaseEntryFilters) {
        const query = String(filters.q || '').trim().toLowerCase();
        const from = String(filters.from || '').trim();
        const to = String(filters.to || '').trim();

        if (query) {
            const haystack = [
                entry.supplierName,
                entry.supplierDocument || '',
                entry.invoiceNumber || '',
                entry.notes || '',
                ...(entry.items || []).map((item) => [item.productName, item.notes || ''].join(' ')),
            ].join(' ').toLowerCase();

            if (!haystack.includes(query)) {
                return false;
            }
        }

        if (from && entry.purchaseDate < from) {
            return false;
        }

        if (to && entry.purchaseDate > to) {
            return false;
        }

        return true;
    }

    private normalizeWriteData(data: PurchaseEntryWriteData, isCreate: boolean) {
        const normalized: Partial<PurchaseEntry> = {};

        if (Object.prototype.hasOwnProperty.call(data, 'supplierName')) {
            normalized.supplierName = this.normalizeRequiredText(String(data.supplierName || ''), 'Fornecedor');
        } else if (isCreate) {
            throw new HttpException('Fornecedor é obrigatório.', HttpStatus.BAD_REQUEST);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'supplierDocument')) {
            normalized.supplierDocument = this.normalizeOptionalText(data.supplierDocument);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'invoiceNumber')) {
            normalized.invoiceNumber = this.normalizeOptionalText(data.invoiceNumber);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'purchaseDate')) {
            normalized.purchaseDate = this.normalizePurchaseDate(data.purchaseDate, isCreate);
        } else if (isCreate) {
            normalized.purchaseDate = this.normalizePurchaseDate(undefined, true);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'notes')) {
            normalized.notes = this.normalizeOptionalText(data.notes);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'items')) {
            const items = this.normalizeItems(data.items);
            if (isCreate && items.length === 0) {
                throw new HttpException('Informe ao menos um item na compra.', HttpStatus.BAD_REQUEST);
            }
            normalized.items = items;
            normalized.totalAmount = this.roundMoney(items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0));
        } else if (isCreate) {
            throw new HttpException('Informe ao menos um item na compra.', HttpStatus.BAD_REQUEST);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'createdByUserId')) {
            normalized.createdByUserId = this.normalizeOptionalText(data.createdByUserId);
        }

        if (Object.prototype.hasOwnProperty.call(data, 'createdByUserName')) {
            normalized.createdByUserName = this.normalizeOptionalText(data.createdByUserName);
        }

        return normalized;
    }

    private normalizeItems(input?: Array<Record<string, unknown>> | null): PurchaseEntryItem[] {
        if (!Array.isArray(input) || input.length === 0) {
            return [];
        }

        const items = input
            .map((rawItem) => {
                const productName = this.normalizeRequiredText(
                    String(rawItem?.productName ?? rawItem?.product_name ?? ''),
                    'Item da compra',
                );
                const quantity = Number(rawItem?.quantity);
                const unitCost = Number(rawItem?.unitCost ?? rawItem?.unit_cost);
                const notes = this.normalizeOptionalText(rawItem?.notes);

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new HttpException(`Quantidade inválida para o item ${productName}.`, HttpStatus.BAD_REQUEST);
                }

                if (!Number.isFinite(unitCost) || unitCost < 0) {
                    throw new HttpException(`Custo unitário inválido para o item ${productName}.`, HttpStatus.BAD_REQUEST);
                }

                return {
                    productName,
                    quantity: this.roundQuantity(quantity),
                    unitCost: this.roundMoney(unitCost),
                    totalCost: this.roundMoney(quantity * unitCost),
                    notes,
                };
            })
            .filter((item) => item.productName !== '');

        if (items.length === 0) {
            throw new HttpException('Informe ao menos um item válido na compra.', HttpStatus.BAD_REQUEST);
        }

        return items;
    }

    private normalizePurchaseDate(value?: string, isCreate = false) {
        const raw = String(value || '').trim();
        if (!raw) {
            return isCreate ? new Date().toISOString().slice(0, 10) : undefined;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            throw new HttpException('Data da compra inválida.', HttpStatus.BAD_REQUEST);
        }

        if (isCreate) {
            return raw;
        }

        return raw;
    }

    private serialize(entry: PurchaseEntry) {
        const items = Array.isArray(entry.items) ? (entry.items as Array<Record<string, unknown>>).map((item) => ({
            productName: String(item?.productName || item?.product_name || '').trim(),
            quantity: this.roundQuantity(Number(item?.quantity || 0)),
            unitCost: this.roundMoney(Number(item?.unitCost || item?.unit_cost || 0)),
            totalCost: this.roundMoney(Number(item?.totalCost || item?.total_cost || 0)),
            notes: this.normalizeOptionalText(item?.notes),
        })) : [];

        const totalAmount = this.roundMoney(Number(entry.totalAmount || 0));

        return {
            id: entry.id,
            tenantId: entry.tenantId,
            supplierName: entry.supplierName,
            supplierDocument: entry.supplierDocument || null,
            invoiceNumber: entry.invoiceNumber || null,
            purchaseDate: entry.purchaseDate,
            notes: entry.notes || null,
            items,
            itemCount: items.length,
            totalAmount,
            createdByUserId: entry.createdByUserId || null,
            createdByUserName: entry.createdByUserName || null,
            createdAt: entry.createdAt?.toISOString?.() || null,
            updatedAt: entry.updatedAt?.toISOString?.() || null,
        };
    }

    private normalizeRequiredText(value: string, fieldLabel: string) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            throw new HttpException(`${fieldLabel} é obrigatório.`, HttpStatus.BAD_REQUEST);
        }

        return normalized;
    }

    private normalizeOptionalText(value?: unknown) {
        const normalized = String(value ?? '').trim();
        return normalized || null;
    }

    private roundMoney(value: number) {
        return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }

    private roundQuantity(value: number) {
        return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
    }
}

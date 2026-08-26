import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuCategory } from '../../entities/menu-category.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CategoriesService {
    constructor(
        @InjectRepository(MenuCategory)
        private readonly categoryRepo: Repository<MenuCategory>,
        @InjectRepository(MenuItem)
        private readonly menuItemRepo: Repository<MenuItem>,
    ) { }

    async findAll(tenantId: string) {
        const categories = await this.categoryRepo.find({
            where: { tenantId },
            order: { displayOrder: 'ASC', name: 'ASC' },
        });

        if (!categories.length) {
            return [];
        }

        const countRows = await this.menuItemRepo
            .createQueryBuilder('item')
            .select('item.category_id', 'categoryId')
            .addSelect("COUNT(*) FILTER (WHERE item.destination IN ('KITCHEN', 'BAR'))", 'foodItemCount')
            .addSelect("COUNT(*) FILTER (WHERE item.destination = 'PICKING')", 'retailItemCount')
            .where('item.tenant_id = :tenantId', { tenantId })
            .andWhere('item.category_id IN (:...categoryIds)', {
                categoryIds: categories.map((category) => category.id),
            })
            .groupBy('item.category_id')
            .getRawMany();

        const countByCategoryId = new Map(
            countRows.map((row: { categoryId: string; foodItemCount: string; retailItemCount: string }) => [
                String(row.categoryId),
                {
                    food: Number.parseInt(String(row.foodItemCount || '0'), 10) || 0,
                    retail: Number.parseInt(String(row.retailItemCount || '0'), 10) || 0,
                },
            ]),
        );

        // Categories that only contain PICKING items belong to RETAIL. Empty
        // categories remain visible here so restaurant operators can still use
        // them while creating the first food item.
        const result = categories
            .filter((category) => {
                const counts = countByCategoryId.get(category.id);
                return !counts || counts.food > 0 || counts.retail === 0;
            })
            .map((category) => ({
                ...category,
                itemCount: countByCategoryId.get(category.id)?.food || 0,
            }));

        return result;
    }

    async findOne(id: string, tenantId: string) {
        return this.categoryRepo.findOne({ where: { id, tenantId } });
    }

    async create(tenantId: string, data: Partial<MenuCategory>) {
        const category = this.categoryRepo.create({
            ...data,
            id: uuidv4(),
            tenantId,
        });
        return this.categoryRepo.save(category);
    }

    async update(id: string, tenantId: string, data: Partial<MenuCategory>) {
        await this.categoryRepo.update({ id, tenantId }, data);
        return this.findOne(id, tenantId);
    }

    async remove(id: string, tenantId: string) {
        return this.categoryRepo.delete({ id, tenantId });
    }
}

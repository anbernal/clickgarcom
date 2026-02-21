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

        // Count items per category
        const result = await Promise.all(
            categories.map(async (cat) => {
                const itemCount = await this.menuItemRepo.count({
                    where: { categoryId: cat.id, tenantId },
                });
                return { ...cat, itemCount };
            }),
        );

        return result;
    }

    async findOne(id: string) {
        return this.categoryRepo.findOne({ where: { id } });
    }

    async create(tenantId: string, data: Partial<MenuCategory>) {
        const category = this.categoryRepo.create({
            ...data,
            id: uuidv4(),
            tenantId,
        });
        return this.categoryRepo.save(category);
    }

    async update(id: string, data: Partial<MenuCategory>) {
        await this.categoryRepo.update(id, data);
        return this.findOne(id);
    }

    async remove(id: string) {
        return this.categoryRepo.delete(id);
    }
}

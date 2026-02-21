import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { v4 as uuidv4 } from 'uuid';

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
        return this.menuItemRepo.find({
            where,
            relations: ['category'],
            order: { displayOrder: 'ASC', name: 'ASC' },
        });
    }

    async findOne(id: string) {
        return this.menuItemRepo.findOne({ where: { id }, relations: ['category'] });
    }

    async create(tenantId: string, data: Partial<MenuItem>) {
        const item = this.menuItemRepo.create({
            ...data,
            id: uuidv4(),
            tenantId,
        });
        return this.menuItemRepo.save(item);
    }

    async update(id: string, data: Partial<MenuItem>) {
        await this.menuItemRepo.update(id, data);
        return this.findOne(id);
    }

    async toggleAvailability(id: string) {
        const item = await this.findOne(id);
        if (!item) return null;
        item.available = !item.available;
        return this.menuItemRepo.save(item);
    }

    async remove(id: string) {
        return this.menuItemRepo.delete(id);
    }
}

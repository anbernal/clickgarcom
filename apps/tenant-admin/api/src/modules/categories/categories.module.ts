import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuCategory } from '../../entities/menu-category.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
    imports: [TypeOrmModule.forFeature([MenuCategory, MenuItem])],
    controllers: [CategoriesController],
    providers: [CategoriesService],
})
export class CategoriesModule { }

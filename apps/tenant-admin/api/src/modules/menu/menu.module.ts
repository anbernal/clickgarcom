import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
    imports: [TypeOrmModule.forFeature([MenuItem, MenuCategory])],
    controllers: [MenuController],
    providers: [MenuService],
})
export class MenuModule { }

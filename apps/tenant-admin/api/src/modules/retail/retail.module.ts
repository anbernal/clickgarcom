import { Module } from '@nestjs/common';

import { RetailController } from './retail.controller';
import { RetailService } from './retail.service';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuModule } from '../menu/menu.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { RetailCheckoutService } from './retail-checkout.service';
import { RetailPublicController } from './retail-public.controller';

@Module({
    imports: [TypeOrmModule.forFeature([MenuItem, MenuCategory]), MenuModule, DeliveryModule],
    controllers: [RetailController, RetailPublicController],
    providers: [RetailService, RetailCheckoutService],
})
export class RetailModule { }

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Tenant } from '../../entities/tenant.entity';
import { MenuController } from './menu.controller';
import { PublicMenuController } from './public-menu.controller';
import { MenuService } from './menu.service';
import { PublicMenuCustomerService } from './public-menu-customer.service';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([MenuItem, MenuCategory, Tenant]),
        DeliveryModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET') || 'super-secret-key-clg-2024',
            }),
        }),
    ],
    controllers: [MenuController, PublicMenuController],
    providers: [MenuService, PublicMenuCustomerService],
})
export class MenuModule { }

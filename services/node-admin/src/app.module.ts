import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Table } from './entities/table.entity';
import { Tab } from './entities/tab.entity';
import { TableRequest } from './entities/table-request.entity';
import { User } from './entities/user.entity';
import { Tenant } from './entities/tenant.entity';

import { MenuModule } from './modules/menu/menu.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TablesModule } from './modules/tables/tables.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AmqpModule } from './modules/amqp/amqp.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppController } from './app.controller';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: 'sqlite',
            database: 'database.sqlite',
            entities: [MenuCategory, MenuItem, Order, OrderItem, Table, Tab, TableRequest, User, Tenant],
            synchronize: true, // Auto-create tables for local sqlite dev
        }),
        AmqpModule,
        MenuModule,
        CategoriesModule,
        OrdersModule,
        TablesModule,
        ReportsModule,
        AuthModule,
    ],
    controllers: [AppController],
})
export class AppModule { }

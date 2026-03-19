import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderBatch } from './entities/order-batch.entity';
import { Table } from './entities/table.entity';
import { Tab } from './entities/tab.entity';
import { TableRequest } from './entities/table-request.entity';
import { User } from './entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { MessageLog } from './entities/message-log.entity';
import { BotFlowDefinition } from './entities/bot-flow-definition.entity';

import { MenuModule } from './modules/menu/menu.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TablesModule } from './modules/tables/tables.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AmqpModule } from './modules/amqp/amqp.module';
import { AuthModule } from './modules/auth/auth.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { BotConfigModule } from './modules/bot-config/bot-config.module';
import { AppController } from './app.controller';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DATABASE_HOST || 'localhost',
            port: parseInt(process.env.DATABASE_PORT || '5432', 10),
            username: process.env.DATABASE_USER || 'postgres',
            password: process.env.DATABASE_PASSWORD || 'postgres123',
            database: process.env.DATABASE_NAME || 'clickgarcom_db',
            entities: [MenuCategory, MenuItem, Order, OrderItem, OrderBatch, Table, Tab, TableRequest, User, Tenant, MessageLog, BotFlowDefinition],
            synchronize: false,
        }),
        AmqpModule,
        MenuModule,
        CategoriesModule,
        OrdersModule,
        TablesModule,
        ReportsModule,
        AuthModule,
        SuperAdminModule,
        WalletModule,
        BotConfigModule,
    ],
    controllers: [AppController],
})
export class AppModule { }

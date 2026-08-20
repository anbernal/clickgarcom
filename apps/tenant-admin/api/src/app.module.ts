import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { UserAccessAuditLog } from './entities/user-access-audit-log.entity';
import { WalletBillingCycle } from './entities/wallet-billing-cycle.entity';
import { PurchaseEntry } from './entities/purchase-entry.entity';
import { Delivery } from './entities/delivery.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { DeliveryTrackingCredential } from './entities/delivery-tracking-credential.entity';
import { DeliveryLocationSample } from './entities/delivery-location-sample.entity';
import { DeliveryPinChallenge } from './entities/delivery-pin-challenge.entity';
import { DeliveryCommandIdempotency } from './entities/delivery-command-idempotency.entity';
import { DomainOutboxEvent } from './entities/domain-outbox-event.entity';
import { Customer } from './entities/customer.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { DeliveryProviderConfig } from './entities/delivery-provider-config.entity';
import { DeliveryProviderCredential } from './entities/delivery-provider-credential.entity';
import { DeliveryQuote } from './entities/delivery-quote.entity';
import { DeliveryFulfillment } from './entities/delivery-fulfillment.entity';
import { DeliveryProviderAttempt } from './entities/delivery-provider-attempt.entity';
import { DeliveryOwnCapacityReservation } from './entities/delivery-own-capacity-reservation.entity';
import { DeliveryProviderWebhookInbox } from './entities/delivery-provider-webhook-inbox.entity';
import { DeliveryCheckout } from './entities/delivery-checkout.entity';
import { DeliveryDriverProfile } from './entities/delivery-driver-profile.entity';
import { DeliveryDriverAssignment } from './entities/delivery-driver-assignment.entity';
import { DeliveryDriverAccessLink } from './entities/delivery-driver-access-link.entity';
import { DeliveryDriverSession } from './entities/delivery-driver-session.entity';
import { DeliveryDriverIncident } from './entities/delivery-driver-incident.entity';
import { DeliveryDriverEvent } from './entities/delivery-driver-event.entity';

import { MenuModule } from './modules/menu/menu.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TablesModule } from './modules/tables/tables.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AmqpModule } from './modules/amqp/amqp.module';
import { AuthModule } from './modules/auth/auth.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { BotConfigModule } from './modules/bot-config/bot-config.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { RolesGuard } from './modules/auth/roles.guard';
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
            entities: [MenuCategory, MenuItem, Order, OrderItem, OrderBatch, Table, Tab, TableRequest, User, Tenant, MessageLog, BotFlowDefinition, UserAccessAuditLog, WalletBillingCycle, PurchaseEntry, Delivery, DeliveryEvent, DeliveryTrackingCredential, DeliveryLocationSample, DeliveryPinChallenge, DeliveryCommandIdempotency, DomainOutboxEvent, Customer, CustomerAddress, DeliveryProviderConfig, DeliveryProviderCredential, DeliveryQuote, DeliveryFulfillment, DeliveryProviderAttempt, DeliveryOwnCapacityReservation, DeliveryProviderWebhookInbox, DeliveryCheckout, DeliveryDriverProfile, DeliveryDriverAssignment, DeliveryDriverAccessLink, DeliveryDriverSession, DeliveryDriverIncident, DeliveryDriverEvent],
            synchronize: false,
        }),
        AmqpModule,
        MenuModule,
        CategoriesModule,
        OrdersModule,
        TablesModule,
        ReportsModule,
        AuthModule,
        WalletModule,
        BotConfigModule,
        PurchasesModule,
        DeliveryModule,
    ],
    controllers: [AppController],
    providers: [
        {
            provide: APP_GUARD,
            useClass: RolesGuard,
        },
    ],
})
export class AppModule { }

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { OrderBatch } from '../../entities/order-batch.entity';
import { Tenant } from '../../entities/tenant.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
    imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderBatch, Tenant, UserAccessAuditLog])],
    controllers: [OrdersController],
    providers: [OrdersService],
})
export class OrdersModule { }

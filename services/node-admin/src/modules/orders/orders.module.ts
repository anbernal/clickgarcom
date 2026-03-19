import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { OrderBatch } from '../../entities/order-batch.entity';
import { Tenant } from '../../entities/tenant.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
    imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderBatch, Tenant])],
    controllers: [OrdersController],
    providers: [OrdersService],
})
export class OrdersModule { }

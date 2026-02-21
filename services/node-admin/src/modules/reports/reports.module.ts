import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
    imports: [TypeOrmModule.forFeature([Order, OrderItem, MenuItem, Table, Tab])],
    controllers: [ReportsController],
    providers: [ReportsService],
})
export class ReportsModule { }

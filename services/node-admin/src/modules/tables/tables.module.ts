import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { TableRequest } from '../../entities/table-request.entity';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
    imports: [TypeOrmModule.forFeature([Table, Tab, TableRequest])],
    controllers: [TablesController],
    providers: [TablesService],
})
export class TablesModule { }

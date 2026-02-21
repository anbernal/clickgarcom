import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
    imports: [TypeOrmModule.forFeature([Table, Tab])],
    controllers: [TablesController],
    providers: [TablesService],
})
export class TablesModule { }

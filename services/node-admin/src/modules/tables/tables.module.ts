import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Table } from '../../entities/table.entity';
import { Tab } from '../../entities/tab.entity';
import { TableRequest } from '../../entities/table-request.entity';
import { WalletModule } from '../wallet/wallet.module';
import { InternalTablesController } from './internal-tables.controller';
import { PublicTablesController } from './public-tables.controller';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
    imports: [TypeOrmModule.forFeature([Table, Tab, TableRequest]), WalletModule],
    controllers: [TablesController, PublicTablesController, InternalTablesController],
    providers: [TablesService],
})
export class TablesModule { }

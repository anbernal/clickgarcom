import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PurchaseEntry } from '../../entities/purchase-entry.entity';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
    imports: [TypeOrmModule.forFeature([PurchaseEntry])],
    controllers: [PurchasesController],
    providers: [PurchasesService],
})
export class PurchasesModule { }

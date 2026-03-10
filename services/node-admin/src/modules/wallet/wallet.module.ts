import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tenant } from '../../entities/tenant.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
    imports: [TypeOrmModule.forFeature([Tenant])],
    controllers: [WalletController],
    providers: [WalletService],
    exports: [WalletService],
})
export class WalletModule { }

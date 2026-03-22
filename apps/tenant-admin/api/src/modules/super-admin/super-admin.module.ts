import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { MessageLog } from '../../entities/message-log.entity';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
    imports: [TypeOrmModule.forFeature([Tenant, User, MessageLog])],
    controllers: [SuperAdminController],
    providers: [SuperAdminService],
})
export class SuperAdminModule { }

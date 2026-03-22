import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotConfigController } from './bot-config.controller';
import { BotConfigService } from './bot-config.service';
import { BotFlowDefinition } from '../../entities/bot-flow-definition.entity';

@Module({
    imports: [TypeOrmModule.forFeature([BotFlowDefinition])],
    controllers: [BotConfigController],
    providers: [BotConfigService],
    exports: [BotConfigService],
})
export class BotConfigModule { }

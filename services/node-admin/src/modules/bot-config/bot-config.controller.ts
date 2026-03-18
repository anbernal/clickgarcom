import { Controller, Get, Param, Put, Body, Query, Request, UseGuards } from '@nestjs/common';
import { BotConfigService } from './bot-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('admin/api/bot-config')
export class BotConfigController {
    constructor(private readonly botConfigService: BotConfigService) { }

    @Get('flows')
    async listPublishedFlows(@Request() req, @Query('channel') channel?: string) {
        return this.botConfigService.listPublishedFlows(req.user.tenantId, channel);
    }

    @Get('flows/:key')
    async getPublishedFlow(
        @Request() req,
        @Param('key') key: string,
        @Query('channel') channel?: string,
    ) {
        return this.botConfigService.getPublishedFlow(req.user.tenantId, key, channel);
    }

    @Get('flows/:key/default')
    async getDefaultFlow(@Param('key') key: string) {
        return this.botConfigService.getDefaultFlow(key);
    }

    @Put('flows/:key/published')
    async publishFlow(
        @Request() req,
        @Param('key') key: string,
        @Body() payload: any,
        @Query('channel') channel?: string,
    ) {
        return this.botConfigService.publishFlow(
            req.user.tenantId,
            key,
            channel,
            payload || {},
            req.user.id,
        );
    }
}

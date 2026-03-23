import { Controller, Get, Param, Put, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { BotConfigService } from './bot-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_BOT_CONFIG_ROLES } from '../auth/roles';

@UseGuards(JwtAuthGuard)
@Controller('admin/api/bot-config')
@Roles(...TENANT_BOT_CONFIG_ROLES)
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

    @Get('flows/:key/versions')
    async listFlowVersions(
        @Request() req,
        @Param('key') key: string,
        @Query('channel') channel?: string,
    ) {
        return this.botConfigService.listFlowVersions(req.user.tenantId, key, channel);
    }

    @Get('flows/:key/diff')
    async getFlowDiff(
        @Request() req,
        @Param('key') key: string,
        @Query('from_flow_id') fromFlowId?: string,
        @Query('to_flow_id') toFlowId?: string,
        @Query('channel') channel?: string,
    ) {
        return this.botConfigService.getFlowDiff(req.user.tenantId, key, fromFlowId, toFlowId, channel);
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

    @Post('flows/:key/rollback')
    async rollbackFlow(
        @Request() req,
        @Param('key') key: string,
        @Body() payload: any,
        @Query('channel') channel?: string,
    ) {
        return this.botConfigService.rollbackFlow(
            req.user.tenantId,
            key,
            channel,
            payload || {},
            req.user.id,
        );
    }
}

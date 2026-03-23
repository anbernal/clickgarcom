import { Body, Controller, Get, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { Roles } from '../auth/roles.decorator';
import { TENANT_WALLET_ROLES } from '../auth/roles';

@Controller('admin/api')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_WALLET_ROLES)
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get('wallet/balance')
    getBalance(@Request() req) {
        return this.walletService.getBalance(req.user.tenantId);
    }

    @Get('wallet/messages/statement')
    getMessageStatement(
        @Request() req,
        @Query() query?: Record<string, string>,
    ) {
        return this.walletService.getMessageStatement(req.user.tenantId, query || {});
    }

    @Get('wallet/messages/statement/export')
    async exportMessageStatement(
        @Request() req,
        @Query() query: Record<string, string> | undefined,
        @Res() res: Response,
    ) {
        const file = await this.walletService.exportMessageStatementCsv(req.user.tenantId, query || {});
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        return res.send(`\uFEFF${file.content}`);
    }

    @Post('payments/pix')
    createPixPayment(@Request() req, @Body() body: Record<string, unknown>) {
        return this.walletService.createPixPayment(req.user.tenantId, body, {
            userId: req.user?.id,
            userName: req.user?.name,
            userRole: req.user?.role,
        });
    }
}

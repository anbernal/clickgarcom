import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('admin/api')
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @UseGuards(JwtAuthGuard)
    @Get('wallet/balance')
    getBalance(@Request() req) {
        return this.walletService.getBalance(req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('payments/pix')
    createPixPayment(@Request() req, @Body() body: Record<string, unknown>) {
        return this.walletService.createPixPayment(req.user.tenantId, body);
    }
}

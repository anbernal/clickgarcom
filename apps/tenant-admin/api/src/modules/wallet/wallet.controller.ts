import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';

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

    @Post('payments/pix')
    createPixPayment(@Request() req, @Body() body: Record<string, unknown>) {
        return this.walletService.createPixPayment(req.user.tenantId, body);
    }
}

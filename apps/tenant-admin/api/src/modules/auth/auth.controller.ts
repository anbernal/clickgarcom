import { Controller, Post, Body, Request, UseGuards, Get, HttpException, HttpStatus, Patch, Put, UnauthorizedException, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { Roles } from './roles.decorator';
import { TENANT_AUTHENTICATED_ROLES, TENANT_FULL_ACCESS_ROLES } from './roles';

@Controller('admin/api/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Body() data: any) {
        // Fase 11: Criação de Tenant foi delegada ao Super Admin isolado. O Node-Admin (Painel do Restaurante) não possui mais cadastro público.
        throw new UnauthorizedException('Criação pública de contas desativada. Solicite ao Super Admin.');
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() data: LoginDto) {
        return this.authService.login(data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    @Roles(...TENANT_AUTHENTICATED_ROLES)
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Patch('status')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async toggleStatus(@Request() req, @Body() data: { currentStatus?: boolean; is_open?: boolean }) {
        if (typeof data.is_open === 'boolean') {
            return this.authService.setTenantStatus(req.user.tenantId, data.is_open);
        }
        return this.authService.toggleTenantStatus(req.user.tenantId, !!data.currentStatus);
    }

    @UseGuards(JwtAuthGuard)
    @Get('messages')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async getMessages(@Request() req) {
        return this.authService.getTenantMessages(req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Put('messages')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async updateMessages(@Request() req, @Body() data: any) {
        return this.authService.updateTenantMessages(req.user.tenantId, data || {});
    }
}

import { Controller, Post, Body, Request, UseGuards, Get, Patch, Put, UnauthorizedException, HttpCode, Param, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { LoginDto } from './dto/login.dto';
import { ResetTenantUserPasswordDto } from './dto/reset-tenant-user-password.dto';
import { UpdateTenantOperationalSettingsDto } from './dto/update-tenant-operational-settings.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { UpdateTenantUserStatusDto } from './dto/update-tenant-user-status.dto';
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
        return this.authService.getProfile(req.user.id, req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('status')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async toggleStatus(@Request() req, @Body() data: { currentStatus?: boolean; is_open?: boolean }) {
        if (typeof data.is_open === 'boolean') {
            return this.authService.setTenantStatus(req.user.tenantId, data.is_open, {
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
            });
        }
        return this.authService.toggleTenantStatus(req.user.tenantId, !!data.currentStatus, undefined, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get('messages')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async getMessages(@Request() req) {
        return this.authService.getTenantMessages(req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('settings/operational')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async getOperationalSettings(@Request() req) {
        return this.authService.getTenantOperationalSettings(req.user.tenantId);
    }

    @UseGuards(JwtAuthGuard)
    @Put('messages')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async updateMessages(@Request() req, @Body() data: any) {
        return this.authService.updateTenantMessages(req.user.tenantId, data || {}, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        });
    }

    @UseGuards(JwtAuthGuard)
    @Put('settings/operational')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async updateOperationalSettings(@Request() req, @Body() data: UpdateTenantOperationalSettingsDto) {
        return this.authService.updateTenantOperationalSettings(req.user.tenantId, data || {}, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        });
    }

    @UseGuards(JwtAuthGuard)
    @Patch('password')
    @Roles(...TENANT_AUTHENTICATED_ROLES)
    async changePassword(@Request() req, @Body() data: ChangePasswordDto) {
        return this.authService.changePassword(req.user.id, req.user.tenantId, data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('users')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async listUsers(@Request() req) {
        return this.authService.listUsers(req.user.tenantId, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        });
    }

    @UseGuards(JwtAuthGuard)
    @Post('users')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async createUser(@Request() req, @Body() data: CreateTenantUserDto) {
        return this.authService.createUser(req.user.tenantId, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        }, data);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('users/:id')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async updateUser(@Request() req, @Param('id') id: string, @Body() data: UpdateTenantUserDto) {
        return this.authService.updateUser(req.user.tenantId, id, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        }, data);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('users/:id/status')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async updateUserStatus(@Request() req, @Param('id') id: string, @Body() data: UpdateTenantUserStatusDto) {
        return this.authService.updateUserStatus(req.user.tenantId, id, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        }, data);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('users/:id/password')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async resetUserPassword(@Request() req, @Param('id') id: string, @Body() data: ResetTenantUserPasswordDto) {
        return this.authService.resetUserPassword(req.user.tenantId, id, {
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
        }, data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('audit')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    async listAudit(@Request() req) {
        return this.authService.listAuditLogs(req.user.tenantId);
    }
}

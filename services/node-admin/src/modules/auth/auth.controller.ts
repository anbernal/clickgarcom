import { Controller, Post, Get, Patch, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('admin/api/auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Body() data: any) {
        return this.authService.register(data);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() data: any) {
        return this.authService.login(data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Patch('status')
    async toggleStatus(@Request() req, @Body() data: { currentStatus: boolean }) {
        return this.authService.toggleTenantStatus(req.user.tenantId, data.currentStatus);
    }
}


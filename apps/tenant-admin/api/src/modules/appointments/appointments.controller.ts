import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_APPOINTMENTS_CONFIG_ROLES, TENANT_APPOINTMENTS_OPERATE_ROLES, TENANT_APPOINTMENTS_READ_ROLES } from '../auth/roles';
import { AppointmentsService } from './appointments.service';

@Controller('admin/api/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
    constructor(private readonly service: AppointmentsService) {}
    @Get('workspace') @Roles(...TENANT_APPOINTMENTS_READ_ROLES) workspace(@Request() req: any) { return this.service.workspace(req.user.tenantId); }
    @Post('services') @Roles(...TENANT_APPOINTMENTS_CONFIG_ROLES) createService(@Request() req: any, @Body() body: any) { return this.service.createService(req.user.tenantId, body); }
    @Patch('services/:id') @Roles(...TENANT_APPOINTMENTS_CONFIG_ROLES) updateService(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.updateService(req.user.tenantId, id, body); }
    @Post('professionals') @Roles(...TENANT_APPOINTMENTS_CONFIG_ROLES) createProfessional(@Request() req: any, @Body() body: any) { return this.service.createProfessional(req.user.tenantId, body); }
    @Patch('professionals/:id') @Roles(...TENANT_APPOINTMENTS_CONFIG_ROLES) updateProfessional(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.updateProfessional(req.user.tenantId, id, body); }
    @Post() @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) create(@Request() req: any, @Body() body: any) { return this.service.createAdminAppointment(req.user.tenantId, body, this.actor(req)); }
    @Patch(':id') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) update(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.updateAppointment(req.user.tenantId, id, body, this.actor(req)); }
    @Post(':id/confirm') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) confirm(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.transition(req.user.tenantId, id, 'CONFIRMED', body?.expected_version, this.actor(req), body?.reason); }
    @Post(':id/check-in') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) checkIn(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.transition(req.user.tenantId, id, 'CHECKED_IN', body?.expected_version, this.actor(req), body?.reason); }
    @Post(':id/start') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) start(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.transition(req.user.tenantId, id, 'IN_SERVICE', body?.expected_version, this.actor(req), body?.reason); }
    @Post(':id/complete') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) complete(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.transition(req.user.tenantId, id, 'COMPLETED', body?.expected_version, this.actor(req), body?.reason); }
    @Post(':id/no-show') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) noShow(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.transition(req.user.tenantId, id, 'NO_SHOW', body?.expected_version, this.actor(req), body?.reason); }
    @Post(':id/cancel') @Roles(...TENANT_APPOINTMENTS_OPERATE_ROLES) cancel(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.service.transition(req.user.tenantId, id, 'CANCELED_BY_TENANT', body?.expected_version, this.actor(req), body?.reason); }
    @Post('automations/draft') @Roles(...TENANT_APPOINTMENTS_CONFIG_ROLES) draft(@Request() req: any, @Body() body: any) { return this.service.saveAutomation(req.user.tenantId, body, false, this.actor(req)); }
    @Post('automations/publish') @Roles(...TENANT_APPOINTMENTS_CONFIG_ROLES) publish(@Request() req: any, @Body() body: any) { return this.service.saveAutomation(req.user.tenantId, body, true, this.actor(req)); }
    private actor(req: any) { return { userId: req.user?.id, userName: req.user?.name, userRole: req.user?.role }; }
}

@Controller('api/appointments/public')
export class AppointmentsPublicController {
    constructor(private readonly service: AppointmentsService) {}
    @Get(':slug/bootstrap') bootstrap(@Param('slug') slug: string, @Query('token') token: string) { return this.service.publicBootstrap(slug, token); }
    @Get(':slug/slots') slots(@Param('slug') slug: string, @Query('token') token: string, @Query('service_id') serviceId: string, @Query('date') date: string, @Query('professional_id') professionalId?: string) { return this.service.publicSlots(slug, token, serviceId, date, professionalId); }
    @Post(':slug/bookings') create(@Param('slug') slug: string, @Query('token') token: string, @Body() body: any, @Headers('x-appointment-token') headerToken?: string) { return this.service.publicBooking(slug, token || headerToken || body?.token, body); }
}

@Controller('internal/api/appointments')
export class AppointmentsInternalController {
    constructor(private readonly service: AppointmentsService) {}
    @Post('access') mint(@Headers('x-internal-token') token: string, @Body() body: any) { if (!process.env.INTERNAL_SERVICE_TOKEN || token !== process.env.INTERNAL_SERVICE_TOKEN) throw new UnauthorizedException('invalid internal token'); return this.service.mintAccess(String(body?.tenant_id || ''), String(body?.phone || ''), body?.purpose === 'MANAGE' ? 'MANAGE' : 'BOOKING', body?.customer_id || null, body?.appointment_id || null); }
}

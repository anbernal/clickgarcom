import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DISPATCH_ROLES, TENANT_DELIVERY_REPORT_ROLES, TENANT_FULL_ACCESS_ROLES } from '../auth/roles';
import { DeliveryFleetService } from './delivery-fleet.service';
import { CreateDeliveryDriverDto, DeliveryFleetAssignmentsQueryDto, DeliveryFleetDriversQueryDto, DeliveryFleetReportQueryDto, ReorderDeliveryDriverQueueDto, SetDeliveryDriverStatusDto, UpdateDeliveryDriverDto, UpdateDeliveryFleetConfigDto } from './dto/delivery-fleet.dto';

@Controller('admin/api/delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryFleetController {
    constructor(private readonly fleet: DeliveryFleetService) { }

    @Get('fleet/config')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    config(@Request() req: any) { return this.fleet.getConfig(req.user.tenantId); }

    @Put('fleet/config')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    updateConfig(@Request() req: any, @Body() body: UpdateDeliveryFleetConfigDto) { return this.fleet.updateConfig(req.user.tenantId, body, req.user); }

    @Get('drivers')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    drivers(@Request() req: any, @Query() query: DeliveryFleetDriversQueryDto) { return this.fleet.listDrivers(req.user.tenantId, query); }

    @Post('drivers')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    create(@Request() req: any, @Body() body: CreateDeliveryDriverDto) { return this.fleet.createDriver(req.user.tenantId, body, req.user); }

    @Patch('drivers/:id')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    update(@Request() req: any, @Param('id') id: string, @Body() body: UpdateDeliveryDriverDto) { return this.fleet.updateDriver(req.user.tenantId, id, body, req.user); }

    @Post('drivers/:id/activate')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    activate(@Request() req: any, @Param('id') id: string, @Body() body: SetDeliveryDriverStatusDto) { return this.fleet.setDriverStatus(req.user.tenantId, id, true, body, req.user); }

    @Post('drivers/:id/deactivate')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    deactivate(@Request() req: any, @Param('id') id: string, @Body() body: SetDeliveryDriverStatusDto) { return this.fleet.setDriverStatus(req.user.tenantId, id, false, body, req.user); }

    @Post('drivers/:id/access-links')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    accessLink(@Request() req: any, @Param('id') id: string) { return this.fleet.createAccessLink(req.user.tenantId, id, req.user); }

    @Delete('drivers/:id/sessions')
    @Roles(...TENANT_FULL_ACCESS_ROLES)
    revokeSessions(@Request() req: any, @Param('id') id: string) { return this.fleet.revokeSessions(req.user.tenantId, id); }

    @Get('fleet/assignments')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    assignments(@Request() req: any, @Query() query: DeliveryFleetAssignmentsQueryDto) { return this.fleet.listAssignments(req.user.tenantId, query); }

    @Put('drivers/:id/queue')
    @Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
    reorder(@Request() req: any, @Param('id') id: string, @Body() body: ReorderDeliveryDriverQueueDto) { return this.fleet.reorder(req.user.tenantId, id, body, req.user); }
}

@Controller('admin/api/deliveries/reports')
@UseGuards(JwtAuthGuard)
export class DeliveryFleetReportController {
    constructor(private readonly fleet: DeliveryFleetService) { }

    @Get('drivers')
    @Roles(...TENANT_DELIVERY_REPORT_ROLES)
    report(@Request() req: any, @Query() query: DeliveryFleetReportQueryDto) { return this.fleet.report(req.user.tenantId, query); }
}

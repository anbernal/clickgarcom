import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { FleetDriverPortalService } from './fleet-driver-portal.service';
import { FleetDriverAccessTokenDto, FleetDriverIncidentDto, FleetDriverLoginDto, FleetDriverPinDto, FleetDriverShiftDto } from './dto/fleet-driver-portal.dto';

@Controller('admin/api/public/delivery/drivers')
export class FleetDriverPublicController {
    constructor(private readonly portal: FleetDriverPortalService) {}

    @Post('access/exchange') exchange(@Body() body: FleetDriverAccessTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.portal.exchangeAccessToken(body.token, req, res); }
    @Post('access/activate') activate(@Body() body: FleetDriverPinDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.portal.activate(body.pin, req, res); }
    @Post('login') login(@Body() body: FleetDriverLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.portal.login(body.cpf, body.pin, body.tenant_slug, req, res); }
}

@Controller('admin/api/driver')
export class FleetDriverPortalController {
    constructor(private readonly portal: FleetDriverPortalService) {}

    @Get('session') session(@Req() req: Request) { return this.portal.session(req); }
    @Delete('session') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.portal.logout(req, res); }
    @Put('shift') shift(@Body() body: FleetDriverShiftDto, @Req() req: Request) { return this.portal.shift(body.open, req); }
    @Get('deliveries') queue(@Req() req: Request) { return this.portal.queue(req); }
    @Get('deliveries/history') history(@Query('period') period: string, @Req() req: Request) { return this.portal.history(period, req); }
    @Post('deliveries/:id/:command') command(@Param('id') id: string, @Param('command') command: string, @Body() body: any, @Req() req: Request) { return this.portal.command(id, command, body, req); }
}

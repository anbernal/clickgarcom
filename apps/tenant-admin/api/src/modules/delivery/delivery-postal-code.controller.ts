import { Body, Controller, Get, Headers, Param, Post, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_AUTHENTICATED_ROLES } from '../auth/roles';
import { DeliveryPostalCodeService } from './postal-code/delivery-postal-code.service';
import { DeliveryAddressGeocodeService } from './delivery-address-geocode.service';
import { GeocodeDeliveryAddressDto } from './dto/delivery-address-geocode.dto';

@Controller('admin/api/delivery')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_AUTHENTICATED_ROLES)
export class DeliveryPostalCodeController {
    constructor(
        private readonly postalCodeService: DeliveryPostalCodeService,
        private readonly geocodeService: DeliveryAddressGeocodeService,
    ) { }

    @Post('addresses/postal-code-lookup')
    lookupPost(@Body() body: { postal_code?: string }) {
        return this.postalCodeService.lookup(body?.postal_code || '');
    }

    @Post('addresses/geocode')
    geocode(@Body() body: GeocodeDeliveryAddressDto) {
        return this.geocodeService.geocode(body);
    }

    @Get('postal-code/:postalCode')
    lookup(@Request() _request: any, @Param('postalCode') postalCode: string) {
        return this.postalCodeService.lookup(postalCode);
    }
}

@Controller('admin/api/internal/delivery')
export class DeliveryPostalCodeInternalController {
    constructor(
        private readonly postalCodeService: DeliveryPostalCodeService,
        private readonly geocodeService: DeliveryAddressGeocodeService,
    ) { }

    @Post('addresses/postal-code-lookup')
    lookupPost(@Headers('x-internal-token') token: string, @Body() body: { postal_code?: string }) {
        this.assertInternalToken(token);
        return this.postalCodeService.lookup(body?.postal_code || '');
    }

    @Post('addresses/geocode')
    geocode(@Headers('x-internal-token') token: string, @Body() body: GeocodeDeliveryAddressDto) {
        this.assertInternalToken(token);
        return this.geocodeService.geocode(body);
    }

    @Get('postal-code/:postalCode')
    lookup(@Headers('x-internal-token') token: string, @Param('postalCode') postalCode: string) {
        this.assertInternalToken(token);
        return this.postalCodeService.lookup(postalCode);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) throw new UnauthorizedException('invalid internal token');
    }
}

import { Body, Controller, Headers, Post, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_DELIVERY_DISPATCH_ROLES } from '../auth/roles';
import { CreateExternalDeliveryQuoteDto, UseExternalDeliveryQuoteDto } from './dto/delivery-quote.dto';
import { DeliveryQuoteService } from './delivery-quote.service';

@Controller('admin/api/delivery/quotes')
@UseGuards(JwtAuthGuard)
@Roles(...TENANT_DELIVERY_DISPATCH_ROLES)
export class DeliveryQuoteController {
    constructor(private readonly quoteService: DeliveryQuoteService) { }

    @Post('external')
    create(@Request() request: any, @Body() body: CreateExternalDeliveryQuoteDto) {
        return this.quoteService.createExternalQuote(request.user.tenantId, body);
    }

    @Post('use')
    use(@Request() request: any, @Body() body: UseExternalDeliveryQuoteDto) {
        return this.quoteService.useQuote(request.user.tenantId, body.quote_id, body.delivery_id);
    }
}

@Controller('admin/api/internal/delivery/quotes')
export class DeliveryQuoteInternalController {
    constructor(private readonly quoteService: DeliveryQuoteService) { }

    @Post('external')
    create(@Headers('x-internal-token') token: string, @Body() body: CreateExternalDeliveryQuoteDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.quoteService.createExternalQuote(body.tenant_id, body);
    }

    @Post('use')
    use(@Headers('x-internal-token') token: string, @Body() body: UseExternalDeliveryQuoteDto & { tenant_id?: string }) {
        this.assertInternalToken(token);
        if (!body?.tenant_id) throw new UnauthorizedException('tenant_id is required');
        return this.quoteService.useQuote(body.tenant_id, body.quote_id, body.delivery_id);
    }

    private assertInternalToken(token?: string) {
        const expected = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
        if (!expected || String(token || '').trim() !== expected) throw new UnauthorizedException('invalid internal token');
    }
}

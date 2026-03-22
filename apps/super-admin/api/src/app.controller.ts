import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get('admin/api/health')
    health() {
        return {
            status: 'ok',
            service: 'super-admin-api',
            api_base_path: '/admin/api/super-admin',
        };
    }

    @Get('admin/api/meta')
    meta() {
        return {
            service: 'super-admin-api',
            api_base_path: '/admin/api/super-admin',
            routes: {
                metrics: '/admin/api/super-admin/metrics',
                tenants: '/admin/api/super-admin/tenants',
            },
        };
    }
}

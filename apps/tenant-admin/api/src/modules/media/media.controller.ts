import { Controller, Get, Post, Query, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_MENU_WRITE_ROLES } from '../auth/roles';
import { MediaService, UploadedMenuImage } from './media.service';

@Controller('admin/api/media')
export class MediaController {
    constructor(private readonly mediaService: MediaService) { }

    @Post('menu-image')
    @UseGuards(JwtAuthGuard)
    @Roles(...TENANT_MENU_WRITE_ROLES)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
    uploadMenuImage(@Request() req, @UploadedFile() file?: UploadedMenuImage) {
        return this.mediaService.uploadMenuImage(req.user.tenantId, file);
    }

    // The bucket stays private. This narrow application endpoint is the only
    // public reader and accepts only opaque menu-image keys generated above.
    @Get()
    async getPublicImage(@Query('key') key: string, @Res() response: Response) {
        const object = await this.mediaService.getPublicObject(key);
        response.setHeader('Content-Type', object.contentType);
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (object.size) response.setHeader('Content-Length', String(object.size));
        object.stream.on('error', () => response.destroy());
        object.stream.pipe(response);
    }
}

import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import * as Minio from 'minio';

const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageDescriptor = {
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    extension: 'jpg' | 'png' | 'webp';
};

export type UploadedMenuImage = {
    buffer: Buffer;
    size: number;
};

@Injectable()
export class MediaService implements OnModuleInit {
    private readonly logger = new Logger(MediaService.name);
    private readonly bucket = String(process.env.MEDIA_STORAGE_BUCKET || 'clickgarcom-media').trim();
    private readonly endpoint = String(process.env.MEDIA_STORAGE_ENDPOINT || '').trim();
    private readonly client: Minio.Client | null;
    private ready = false;

    constructor() {
        const accessKey = String(process.env.MEDIA_STORAGE_ACCESS_KEY || '').trim();
        const secretKey = String(process.env.MEDIA_STORAGE_SECRET_KEY || '').trim();
        if (!this.endpoint || !accessKey || !secretKey) {
            this.client = null;
            return;
        }

        const endpointUrl = new URL(this.endpoint.includes('://') ? this.endpoint : `http://${this.endpoint}`);
        this.client = new Minio.Client({
            endPoint: endpointUrl.hostname,
            port: Number(endpointUrl.port || (endpointUrl.protocol === 'https:' ? 443 : 80)),
            useSSL: endpointUrl.protocol === 'https:',
            accessKey,
            secretKey,
        });
    }

    async onModuleInit() {
        if (!this.client) {
            this.logger.warn('Armazenamento de mídia não configurado; uploads de imagem permanecem indisponíveis.');
            return;
        }
        try {
            await this.ensureBucket();
        } catch (error) {
            this.logger.error(`Não foi possível inicializar o armazenamento de mídia: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async uploadMenuImage(tenantId: string, file?: UploadedMenuImage) {
        if (!file?.buffer?.length) throw new BadRequestException('Selecione uma imagem para enviar.');
        if (file.size > MAX_MENU_IMAGE_BYTES) throw new BadRequestException('A imagem deve ter no máximo 5 MB.');
        const image = this.detectImage(file.buffer);
        if (!image) throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP válida.');
        await this.ensureBucket();

        const key = `menu-images/${this.safeTenantId(tenantId)}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${image.extension}`;
        await this.client!.putObject(this.bucket, key, file.buffer, file.size, {
            'Content-Type': image.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Amz-Meta-Origin': 'tenant-admin-menu',
        });

        return {
            key,
            url: this.publicUrl(key),
            content_type: image.contentType,
            size: file.size,
        };
    }

    async getPublicObject(key: string): Promise<{ stream: Readable; contentType: string; size?: number }> {
        const normalizedKey = this.safeObjectKey(key);
        await this.ensureBucket();
        try {
            const [stat, stream] = await Promise.all([
                this.client!.statObject(this.bucket, normalizedKey),
                this.client!.getObject(this.bucket, normalizedKey),
            ]);
            return {
                stream,
                contentType: String(stat.metaData?.['content-type'] || 'application/octet-stream'),
                size: Number(stat.size || 0) || undefined,
            };
        } catch (error: any) {
            if (String(error?.code || '').toUpperCase() === 'NOSUCHKEY' || Number(error?.statusCode) === 404) {
                throw new NotFoundException('Imagem não encontrada.');
            }
            this.logger.error(`Falha ao ler mídia ${normalizedKey}: ${error instanceof Error ? error.message : String(error)}`);
            throw new ServiceUnavailableException('A imagem não está disponível agora.');
        }
    }

    private async ensureBucket() {
        if (!this.client) throw new ServiceUnavailableException('O armazenamento de imagens ainda não está configurado.');
        if (this.ready) return;
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) await this.client.makeBucket(this.bucket, 'us-east-1');
        this.ready = true;
    }

    private publicUrl(key: string) {
        const baseUrl = String(process.env.PUBLIC_ADMIN_BASE_URL || process.env.PUBLIC_WEB_BASE_URL || '').trim().replace(/\/+$/, '');
        if (!baseUrl) return `/admin/api/media?key=${encodeURIComponent(key)}`;
        return `${baseUrl}/admin/api/media?key=${encodeURIComponent(key)}`;
    }

    private safeTenantId(value: string) {
        const tenantId = String(value || '').trim().toLowerCase();
        if (!/^[a-f0-9-]{36}$/.test(tenantId)) throw new BadRequestException('Tenant inválido para upload.');
        return tenantId;
    }

    private safeObjectKey(value: string) {
        const key = String(value || '').trim();
        if (!/^menu-images\/[a-f0-9-]{36}\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(key)) {
            throw new NotFoundException('Imagem não encontrada.');
        }
        return key;
    }

    private detectImage(buffer: Buffer): ImageDescriptor | null {
        if (buffer.length < 12) return null;
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { contentType: 'image/jpeg', extension: 'jpg' };
        if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: 'image/png', extension: 'png' };
        if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { contentType: 'image/webp', extension: 'webp' };
        return null;
    }
}

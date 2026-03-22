import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { Tenant, TenantSettings } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';

type TenantPayload = {
    name?: string;
    slug?: string;
    whatsapp_number?: string;
    waba_id?: string;
    meta_token?: string;
    message_price?: number;
    admin_email?: string;
    admin_password?: string;
};

@Injectable()
export class SuperAdminService {
    private readonly logger = new Logger(SuperAdminService.name);

    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly dataSource: DataSource,
    ) { }

    assertAccess(receivedKey?: string) {
        const configured = (process.env.SUPER_ADMIN_KEY || '').trim();
        if (!configured) return;
        if ((receivedKey || '').trim() !== configured) {
            throw new ForbiddenException('Acesso Super Admin negado.');
        }
    }

    async getMetrics() {
        const hasMessageLogs = await this.hasMessageLogsTable();
        const totalsRows = await this.dataSource.query(
            `SELECT
                COUNT(*)::int AS total_tenants,
                COUNT(*) FILTER (WHERE active = true)::int AS active_tenants
             FROM tenants`,
        );

        const msgRows = hasMessageLogs
            ? await this.dataSource.query(
                `SELECT
                    COALESCE(SUM(CASE WHEN direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS msg_in,
                    COALESCE(SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS msg_out
                 FROM message_logs`,
            )
            : [{ msg_in: 0, msg_out: 0 }];

        const topRows = hasMessageLogs
            ? await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.active,
                    COALESCE(SUM(CASE WHEN ml.direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS msg_in,
                    COALESCE(SUM(CASE WHEN ml.direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS msg_out
                 FROM tenants t
                 LEFT JOIN message_logs ml ON ml.tenant_id = t.id
                 GROUP BY t.id, t.name, t.active
                 ORDER BY (COALESCE(SUM(CASE WHEN ml.direction = 'IN' THEN 1 ELSE 0 END), 0) +
                           COALESCE(SUM(CASE WHEN ml.direction = 'OUT' THEN 1 ELSE 0 END), 0)) DESC, t.name ASC
                 LIMIT 10`,
            )
            : await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.active,
                    0::int AS msg_in,
                    0::int AS msg_out
                 FROM tenants t
                 ORDER BY t.name ASC
                 LIMIT 10`,
            );

        const totals = totalsRows?.[0] || {};
        const msg = msgRows?.[0] || {};
        const topTenants = (topRows || []).map((row: any) => {
            const inCount = Number(row.msg_in || 0);
            const outCount = Number(row.msg_out || 0);
            return {
                id: row.id,
                name: row.name,
                status: row.active ? 'ACTIVE' : 'PAUSED',
                in: inCount,
                out: outCount,
                total: inCount + outCount,
            };
        });

        return {
            totalTenants: Number(totals.total_tenants || 0),
            activeTenants: Number(totals.active_tenants || 0),
            msgIn: Number(msg.msg_in || 0),
            msgOut: Number(msg.msg_out || 0),
            topTenants,
        };
    }

    async listTenants() {
        const hasMessageLogs = await this.hasMessageLogsTable();
        const rows = hasMessageLogs
            ? await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.slug,
                    t.whatsapp_number,
                    t.waba_id,
                    t.active,
                    t.is_open,
                    t.wallet_balance,
                    t.billing_plan,
                    t.message_price,
                    t.created_at,
                    admin_user.email AS admin_email,
                    COALESCE(SUM(CASE WHEN ml.direction = 'IN' THEN 1 ELSE 0 END), 0)::int AS msg_in,
                    COALESCE(SUM(CASE WHEN ml.direction = 'OUT' THEN 1 ELSE 0 END), 0)::int AS msg_out
                 FROM tenants t
                 LEFT JOIN LATERAL (
                    SELECT u.email
                    FROM users u
                    WHERE u.tenant_id = t.id
                    ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.created_at ASC
                    LIMIT 1
                 ) admin_user ON true
                 LEFT JOIN message_logs ml ON ml.tenant_id = t.id
                 GROUP BY
                    t.id, t.name, t.slug, t.whatsapp_number, t.waba_id, t.active, t.is_open, t.wallet_balance, t.billing_plan, t.message_price, t.created_at, admin_user.email
                 ORDER BY t.created_at DESC`,
            )
            : await this.dataSource.query(
                `SELECT
                    t.id,
                    t.name,
                    t.slug,
                    t.whatsapp_number,
                    t.waba_id,
                    t.active,
                    t.is_open,
                    t.wallet_balance,
                    t.billing_plan,
                    t.message_price,
                    t.created_at,
                    admin_user.email AS admin_email,
                    0::int AS msg_in,
                    0::int AS msg_out
                 FROM tenants t
                 LEFT JOIN LATERAL (
                    SELECT u.email
                    FROM users u
                    WHERE u.tenant_id = t.id
                    ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.created_at ASC
                    LIMIT 1
                 ) admin_user ON true
                 ORDER BY t.created_at DESC`,
            );

        const webhookUrl = await this.getWebhookUrl();
        return (rows || []).map((row: any) => {
            const msgIn = Number(row.msg_in || 0);
            const msgOut = Number(row.msg_out || 0);
            return {
                id: row.id,
                name: row.name,
                slug: row.slug,
                whatsappNumber: row.whatsapp_number,
                wabaId: row.waba_id || '',
                adminEmail: row.admin_email || '',
                active: !!row.active,
                isOpen: !!row.is_open,
                walletBalance: Number(row.wallet_balance || 0),
                billingPlan: row.billing_plan || 'pre_paid',
                messagePrice: Number(row.message_price || 0.02),
                webhook: webhookUrl,
                msgsIn: msgIn,
                msgsOut: msgOut,
                msgs: msgIn + msgOut,
                createdAt: row.created_at,
            };
        });
    }

    async createTenant(payload: TenantPayload) {
        const name = String(payload.name || '').trim();
        const slug = String(payload.slug || '').trim().toLowerCase();
        const whatsappNumber = this.normalizeDigits(payload.whatsapp_number);
        const wabaId = this.normalizeDigits(payload.waba_id);
        const metaToken = String(payload.meta_token || '').trim();
        const adminEmail = String(payload.admin_email || '').trim().toLowerCase();
        const adminPassword = String(payload.admin_password || '');

        if (!name || !slug || !whatsappNumber || !wabaId || !adminEmail || !adminPassword) {
            throw new BadRequestException('Preencha nome, slug, WhatsApp, Phone-Number-ID, email e senha.');
        }

        await this.ensureTenantUniqueness(null, slug, whatsappNumber, wabaId);

        const defaults: TenantSettings = {
            split_enabled: true,
            auto_accept_orders: false,
            nps_enabled: true,
            voucher_enabled: true,
            service_fee_percent: 10,
        };

        const tenant = this.tenantRepo.create({
            name,
            slug,
            whatsappNumber,
            wabaId,
            metaToken: metaToken || null,
            messagePrice: payload.message_price !== undefined ? payload.message_price : 0.02,
            active: true,
            isOpen: false,
            settings: defaults,
        });
        const savedTenant = await this.tenantRepo.save(tenant);

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(adminPassword, salt);

        const adminUser = this.userRepo.create({
            tenantId: savedTenant.id,
            name: 'Administrador',
            email: adminEmail,
            phone: whatsappNumber,
            passwordHash,
            role: 'ADMIN',
            active: true,
        });
        await this.userRepo.save(adminUser);

        return {
            id: savedTenant.id,
            name: savedTenant.name,
            slug: savedTenant.slug,
            whatsappNumber: savedTenant.whatsappNumber,
            wabaId: savedTenant.wabaId || '',
            adminEmail,
            webhook: await this.getWebhookUrl(),
        };
    }

    async updateTenant(id: string, payload: TenantPayload) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');

        const name = String(payload.name || '').trim();
        const slug = String(payload.slug || '').trim().toLowerCase();
        const whatsappNumber = this.normalizeDigits(payload.whatsapp_number);
        const wabaId = this.normalizeDigits(payload.waba_id);
        const metaToken = String(payload.meta_token || '').trim();
        const adminEmail = String(payload.admin_email || '').trim().toLowerCase();
        const adminPassword = String(payload.admin_password || '');

        await this.ensureTenantUniqueness(id, slug || tenant.slug, whatsappNumber || tenant.whatsappNumber, wabaId || tenant.wabaId || '');

        if (name) tenant.name = name;
        if (slug) tenant.slug = slug;
        if (whatsappNumber) tenant.whatsappNumber = whatsappNumber;
        if (wabaId) tenant.wabaId = wabaId;
        if (metaToken) tenant.metaToken = metaToken;
        if (payload.message_price !== undefined) tenant.messagePrice = payload.message_price;

        await this.tenantRepo.save(tenant);

        if (adminEmail || adminPassword) {
            let adminUser = await this.userRepo.findOne({
                where: { tenantId: tenant.id, role: 'ADMIN' },
                order: { createdAt: 'ASC' },
            });

            if (!adminUser) {
                adminUser = this.userRepo.create({
                    tenantId: tenant.id,
                    name: 'Administrador',
                    email: adminEmail || `admin+${tenant.slug}@clickgarcom.local`,
                    phone: tenant.whatsappNumber,
                    role: 'ADMIN',
                    active: true,
                    passwordHash: '',
                });
            }

            if (adminEmail) adminUser.email = adminEmail;
            if (adminPassword) {
                const salt = await bcrypt.genSalt(10);
                adminUser.passwordHash = await bcrypt.hash(adminPassword, salt);
            }
            if (!adminUser.passwordHash) {
                const salt = await bcrypt.genSalt(10);
                adminUser.passwordHash = await bcrypt.hash('123456', salt);
            }

            await this.userRepo.save(adminUser);
        }

        return {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            whatsappNumber: tenant.whatsappNumber,
            wabaId: tenant.wabaId || '',
            webhook: await this.getWebhookUrl(),
            updated: true,
        };
    }

    async setTenantActive(id: string, active: boolean) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
        tenant.active = !!active;
        await this.tenantRepo.save(tenant);
        return {
            id: tenant.id,
            active: tenant.active,
        };
    }

    async updateWallet(id: string, payload: { amount?: number; billing_plan?: string }) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException('Tenant nao encontrado.');

        if (payload.billing_plan) {
            const plan = String(payload.billing_plan).trim();
            if (['pre_paid', 'post_paid'].includes(plan)) {
                tenant.billingPlan = plan;
            } else {
                throw new BadRequestException('O plano de faturamento deve ser "pre_paid" ou "post_paid".');
            }
        }

        if (payload.amount !== undefined && payload.amount !== null) {
            const amount = Number(payload.amount);
            if (!Number.isFinite(amount)) {
                throw new BadRequestException('O valor recarregado deve ser um numero valido.');
            }
            tenant.walletBalance = Number(tenant.walletBalance || 0) + amount;
        }

        await this.tenantRepo.save(tenant);

        return {
            id: tenant.id,
            walletBalance: tenant.walletBalance,
            billingPlan: tenant.billingPlan,
        };
    }

    private async ensureTenantUniqueness(
        currentTenantId: string | null,
        slug: string,
        whatsappNumber: string,
        wabaId: string,
    ) {
        const existingSlug = await this.tenantRepo.findOne({ where: { slug } });
        if (existingSlug && existingSlug.id !== currentTenantId) {
            throw new BadRequestException('Slug ja cadastrado.');
        }

        const existingPhone = await this.tenantRepo.findOne({ where: { whatsappNumber } });
        if (existingPhone && existingPhone.id !== currentTenantId) {
            throw new BadRequestException('Numero de WhatsApp ja cadastrado.');
        }

        if (wabaId) {
            const existingWaba = await this.tenantRepo.findOne({ where: { wabaId } });
            if (existingWaba && existingWaba.id !== currentTenantId) {
                throw new BadRequestException('Phone-Number-ID da Meta ja cadastrado.');
            }
        }
    }

    private normalizeDigits(value?: string): string {
        return String(value || '').replace(/\D/g, '');
    }

    private async getWebhookUrl(): Promise<string> {
        const configuredBase =
            process.env.PUBLIC_WEBHOOK_BASE_URL ||
            process.env.NGROK_PUBLIC_URL;
        if (String(configuredBase || '').trim()) {
            const base = String(configuredBase).trim().replace(/\/+$/, '');
            return `${base}/webhooks/whatsapp`;
        }

        const ngrokApiBase = String(process.env.NGROK_API_URL || '').trim().replace(/\/+$/, '');
        if (ngrokApiBase) {
            try {
                const { data } = await axios.get(`${ngrokApiBase}/api/tunnels`, {
                    timeout: 2000,
                });
                const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
                const tunnel =
                    tunnels.find((item: any) =>
                        String(item?.public_url || '').trim().startsWith('https://'),
                    ) ||
                    tunnels.find((item: any) =>
                        String(item?.public_url || '').trim().length > 0,
                    );

                const publicUrl = String(tunnel?.public_url || '').trim();
                if (publicUrl) {
                    const base = publicUrl.replace(/\/+$/, '');
                    return `${base}/webhooks/whatsapp`;
                }
            } catch (error) {
                this.logger.debug(`Falha ao consultar ngrok: ${(error as Error).message}`);
            }
        }

        const base = 'http://localhost:8080';
        return `${base}/webhooks/whatsapp`;
    }

    private async hasMessageLogsTable(): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT to_regclass('public.message_logs') AS reg`,
        );
        return !!rows?.[0]?.reg;
    }
}

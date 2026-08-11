import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Tenant } from '../../entities/tenant.entity';
import { UserAccessAuditLog } from '../../entities/user-access-audit-log.entity';
import { DeliveryPolicyService, DeliveryPolicySettings } from './delivery-policy.service';
import { DeliveryFeeService, DeliveryFeeSettings } from './delivery-fee.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';

export type DeliveryActor = {
    userId?: string;
    userName?: string;
    userRole?: string;
};

type DeliveryV2Settings = {
    default_fulfillment_mode: 'OWN' | 'EXTERNAL';
    own_capacity: { available_couriers: number };
    external: { provider_order: string[]; max_attempts: number; attempt_window_minutes: number };
};

const DEFAULT_DELIVERY_SETTINGS: DeliveryPolicySettings & {
    origin: { lat: number | null; lng: number | null };
    service_area: { mode: 'RADIUS'; radius_km: number };
    fees: DeliveryFeeSettings;
} & DeliveryV2Settings = {
    enabled: false,
    timezone: 'America/Sao_Paulo',
    auto_accept: {
        enabled: false,
        require_confirmed_payment: true,
        max_active_deliveries: 8,
        windows: [],
    },
    origin: { lat: null, lng: null },
    service_area: { mode: 'RADIUS', radius_km: 8 },
    fees: {
        mode: 'NONE',
        fixed_fee: 0,
        bands: [],
        included_km: 0,
        price_per_km: 0,
        minimum_fee: 0,
        rounding_mode: 'NONE',
        surcharges: [],
    },
    default_fulfillment_mode: 'OWN',
    own_capacity: { available_couriers: 0 },
    external: { provider_order: ['IFOOD'], max_attempts: 5, attempt_window_minutes: 15 },
};

@Injectable()
export class DeliverySettingsService {
    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,
        @InjectRepository(UserAccessAuditLog)
        private readonly auditRepository: Repository<UserAccessAuditLog>,
        private readonly policyService: DeliveryPolicyService,
        private readonly feeService: DeliveryFeeService,
    ) { }

    async get(tenantId: string) {
        const tenant = await this.requireTenant(tenantId);
        const settings = this.resolveSettings(tenant.settings || {});
        return {
            tenant_id: tenant.id,
            settings,
            defaults: DEFAULT_DELIVERY_SETTINGS,
            updated_at: tenant.updatedAt?.toISOString() || null,
            settings_version: tenant.updatedAt?.toISOString() || null,
        };
    }

    async update(tenantId: string, payload: UpdateDeliverySettingsDto, actor: DeliveryActor = {}) {
        const tenant = await this.requireTenant(tenantId);
        const currentRaw = (tenant.settings || {}) as Record<string, any>;
        const previous = this.resolveSettings(currentRaw);
        const nextRaw = {
            ...previous,
            ...payload,
            origin: {
                ...previous.origin,
                ...(payload.origin_lat === undefined ? {} : { lat: payload.origin_lat }),
                ...(payload.origin_lng === undefined ? {} : { lng: payload.origin_lng }),
            },
            service_area: {
                ...previous.service_area,
                ...(payload.service_radius_km === undefined ? {} : { radius_km: payload.service_radius_km }),
            },
            auto_accept: {
                ...previous.auto_accept,
                ...(payload.auto_accept || {}),
            },
            fees: payload.fees === undefined && payload.own_delivery_pricing === undefined
                ? previous.fees
                : (payload.fees ?? payload.own_delivery_pricing),
            default_fulfillment_mode: payload.default_fulfillment_mode || previous.default_fulfillment_mode,
            own_capacity: {
                ...previous.own_capacity,
                ...(payload.own_available_couriers === undefined ? {} : { available_couriers: payload.own_available_couriers }),
            },
            external: {
                ...previous.external,
                ...(payload.external_provider_order === undefined ? {} : { provider_order: payload.external_provider_order }),
                ...(payload.external_max_attempts === undefined ? {} : { max_attempts: payload.external_max_attempts }),
                ...(payload.external_attempt_window_minutes === undefined ? {} : { attempt_window_minutes: payload.external_attempt_window_minutes }),
            },
        };
        let next: typeof DEFAULT_DELIVERY_SETTINGS;
        try {
            next = this.resolveSettings(nextRaw);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new BadRequestException((error as Error).message || 'Configuração de Delivery inválida.');
        }

        tenant.settings = {
            ...currentRaw,
            delivery: next,
        } as any;
        await this.tenantRepository.save(tenant);

        await this.auditRepository.save(this.auditRepository.create({
            tenantId,
            actorUserId: actor.userId || null,
            actorName: actor.userName || null,
            actorRole: actor.userRole || null,
            targetUserId: null,
            targetUserName: null,
            eventType: 'DELIVERY_SETTINGS_UPDATED',
            description: 'Configurações de Delivery atualizadas.',
            metadata: {
                before: previous,
                after: next,
            },
        }));

        return {
            status: 'updated',
            tenant_id: tenant.id,
            settings: next,
            defaults: DEFAULT_DELIVERY_SETTINGS,
            updated_at: tenant.updatedAt?.toISOString() || null,
            settings_version: tenant.updatedAt?.toISOString() || null,
        };
    }

    private resolveSettings(raw: Record<string, any>): typeof DEFAULT_DELIVERY_SETTINGS {
        const delivery = raw.delivery || {};
        const policy = this.policyService.validateSettings({
            enabled: delivery.enabled,
            timezone: delivery.timezone,
            auto_accept: delivery.auto_accept,
        });
        const origin = delivery.origin || {};
        const area = delivery.service_area || {};
        const fees = this.feeService.validate(delivery.fees || delivery.own_delivery?.pricing || {});
        const mode = String(delivery.default_fulfillment_mode || DEFAULT_DELIVERY_SETTINGS.default_fulfillment_mode).toUpperCase();
        if (!['OWN', 'EXTERNAL'].includes(mode)) throw new BadRequestException('Modalidade padrão de entrega inválida.');
        const capacity = Number(delivery.own_capacity?.available_couriers ?? DEFAULT_DELIVERY_SETTINGS.own_capacity.available_couriers);
        if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) {
            throw new BadRequestException('Quantidade de entregadores disponíveis deve estar entre 0 e 500.');
        }
        const providerOrder = Array.isArray(delivery.external?.provider_order)
            ? delivery.external.provider_order.map((provider: unknown) => String(provider).toUpperCase())
            : DEFAULT_DELIVERY_SETTINGS.external.provider_order;
        if (providerOrder.length === 0 || providerOrder.some((provider: string) => provider !== 'IFOOD')) {
            throw new BadRequestException('Informe ao menos um operador externo suportado.');
        }
        const maxAttempts = Number(delivery.external?.max_attempts ?? 5);
        const attemptWindowMinutes = Number(delivery.external?.attempt_window_minutes ?? 15);
        if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new BadRequestException('O limite de tentativas externas deve estar entre 1 e 5.');
        if (!Number.isInteger(attemptWindowMinutes) || attemptWindowMinutes < 1 || attemptWindowMinutes > 60) throw new BadRequestException('A janela de tentativas externas deve estar entre 1 e 60 minutos.');
        const lat = origin.lat === null || origin.lat === undefined ? null : Number(origin.lat);
        const lng = origin.lng === null || origin.lng === undefined ? null : Number(origin.lng);
        const radius = area.radius_km === undefined ? DEFAULT_DELIVERY_SETTINGS.service_area.radius_km : Number(area.radius_km);

        if ((lat === null) !== (lng === null)) {
            throw new HttpException('A origem deve informar latitude e longitude juntas.', HttpStatus.BAD_REQUEST);
        }
        if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)) {
            throw new HttpException('Coordenadas de origem inválidas.', HttpStatus.BAD_REQUEST);
        }
        if (!Number.isFinite(radius) || radius <= 0 || radius > 500) {
            throw new HttpException('Raio de entrega inválido.', HttpStatus.BAD_REQUEST);
        }

        return {
            ...policy,
            origin: { lat, lng },
            service_area: { mode: 'RADIUS', radius_km: radius },
            fees,
            default_fulfillment_mode: mode as 'OWN' | 'EXTERNAL',
            own_capacity: { available_couriers: capacity },
            external: { provider_order: Array.from(new Set(providerOrder)), max_attempts: maxAttempts, attempt_window_minutes: attemptWindowMinutes },
        };
    }

    private async requireTenant(tenantId: string): Promise<Tenant> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        return tenant;
    }
}

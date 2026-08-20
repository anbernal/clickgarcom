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
    // Lifecycle is controlled by the Super Admin, but must survive regular
    // restaurant configuration updates.
    enabled_at: string | null;
    expires_at: string | null;
    permanent: boolean;
    disabled_at: string | null;
    whatsapp_order_enabled: boolean;
    whatsapp_order_mode: 'HYBRID' | 'DELIVERY_ONLY';
    default_fulfillment_mode: 'OWN' | 'EXTERNAL';
    own_capacity: { available_couriers: number };
    external: { provider_order: string[]; max_attempts: number; attempt_window_minutes: number };
    /** Frota própria: capacidade agregada or motoboys identificados. */
    own_fleet_mode: 'CAPACITY_ONLY' | 'IDENTIFIED_DRIVERS';
};

type DeliveryOriginAddress = {
    street: string | null;
    address_number: string | null;
    address_complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    formatted_address: string | null;
    geocode_provider: string | null;
    geocode_provider_id: string | null;
    geocode_quality: string | null;
    confirmed: boolean;
};

const DEFAULT_DELIVERY_SETTINGS: DeliveryPolicySettings & {
    origin: { lat: number | null; lng: number | null };
    origin_address: DeliveryOriginAddress | null;
    service_area: { mode: 'RADIUS'; radius_km: number };
    fees: DeliveryFeeSettings;
} & DeliveryV2Settings = {
    enabled: false,
    enabled_at: null,
    expires_at: null,
    permanent: false,
    disabled_at: null,
    timezone: 'America/Sao_Paulo',
    auto_accept: {
        enabled: false,
        require_confirmed_payment: true,
        max_active_deliveries: 8,
        preparation_minutes: 30,
        windows: [],
    },
    origin: { lat: null, lng: null },
    origin_address: null,
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
    whatsapp_order_enabled: false,
    whatsapp_order_mode: 'HYBRID',
    own_capacity: { available_couriers: 0 },
    external: { provider_order: ['IFOOD'], max_attempts: 5, attempt_window_minutes: 15 },
    own_fleet_mode: 'CAPACITY_ONLY',
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
        if (payload.enabled !== undefined) {
            throw new HttpException('A ativação do módulo Delivery é gerenciada exclusivamente pelo Super Admin.', HttpStatus.FORBIDDEN);
        }
        const currentRaw = (tenant.settings || {}) as Record<string, any>;
        const previous = this.resolveSettings(currentRaw);
        // resolveSettings recebe o objeto completo do tenant e lê sempre a chave
        // `delivery`. Montar os dados no nível raiz fazia o serviço ignorar o
        // payload e voltar para os defaults após cada salvamento.
        const nextRaw = {
            ...currentRaw,
            delivery: {
                ...previous,
                enabled: previous.enabled,
                ...(payload.whatsapp_order_enabled === undefined ? {} : { whatsapp_order_enabled: payload.whatsapp_order_enabled }),
                ...(payload.whatsapp_order_mode === undefined ? {} : { whatsapp_order_mode: payload.whatsapp_order_mode }),
                ...(payload.timezone === undefined ? {} : { timezone: payload.timezone }),
                origin: {
                    ...previous.origin,
                    ...(payload.origin_lat === undefined ? {} : { lat: payload.origin_lat }),
                    ...(payload.origin_lng === undefined ? {} : { lng: payload.origin_lng }),
                },
                origin_address: payload.origin_address === undefined
                    ? previous.origin_address
                    : this.normalizeOriginAddress(payload.origin_address, previous.origin_address),
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
                own_fleet_mode: previous.own_fleet_mode,
            },
        };
        let next: typeof DEFAULT_DELIVERY_SETTINGS;
        try {
            next = this.resolveSettings(nextRaw);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new BadRequestException((error as Error).message || 'Configuração de Delivery inválida.');
        }
        if (next.enabled) {
            const hasCoordinates = next.origin.lat !== null && next.origin.lng !== null;
            if (!hasCoordinates) throw new BadRequestException('Para ativar o Delivery, informe latitude e longitude do restaurante.');
            if (!this.hasConfirmedOriginAddress(next.origin_address)) {
                throw new BadRequestException('Para ativar o Delivery, confirme o endereço completo e o número do restaurante.');
            }
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
        const originAddress = this.normalizeOriginAddress(delivery.origin_address, null);
        const area = delivery.service_area || {};
        const fees = this.feeService.validate(delivery.fees || delivery.own_delivery?.pricing || {});
        const mode = String(delivery.default_fulfillment_mode || DEFAULT_DELIVERY_SETTINGS.default_fulfillment_mode).toUpperCase();
        if (!['OWN', 'EXTERNAL'].includes(mode)) throw new BadRequestException('Modalidade padrão de entrega inválida.');
        const whatsappOrderMode = String(delivery.whatsapp_order_mode || DEFAULT_DELIVERY_SETTINGS.whatsapp_order_mode).toUpperCase();
        if (!['HYBRID', 'DELIVERY_ONLY'].includes(whatsappOrderMode)) {
            throw new BadRequestException('Modo de pedido pelo WhatsApp inválido.');
        }
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
            enabled_at: delivery.enabled_at || null,
            expires_at: delivery.expires_at || null,
            permanent: delivery.permanent === true,
            disabled_at: delivery.disabled_at || null,
            origin: { lat, lng },
            origin_address: originAddress,
            service_area: { mode: 'RADIUS', radius_km: radius },
            fees,
            whatsapp_order_enabled: delivery.whatsapp_order_enabled === true,
            whatsapp_order_mode: whatsappOrderMode as 'HYBRID' | 'DELIVERY_ONLY',
            default_fulfillment_mode: mode as 'OWN' | 'EXTERNAL',
            own_capacity: { available_couriers: capacity },
            external: { provider_order: Array.from(new Set(providerOrder)), max_attempts: maxAttempts, attempt_window_minutes: attemptWindowMinutes },
            own_fleet_mode: delivery.own_fleet_mode === 'IDENTIFIED_DRIVERS' || delivery.fleet_mode === 'IDENTIFIED_DRIVERS' ? 'IDENTIFIED_DRIVERS' : 'CAPACITY_ONLY',
        };
    }

    private normalizeOriginAddress(raw: any, fallback: DeliveryOriginAddress | null): DeliveryOriginAddress | null {
        if (!raw || typeof raw !== 'object') return fallback;
        const text = (value: unknown) => {
            const normalized = String(value ?? '').trim();
            return normalized || null;
        };
        const state = text(raw.state)?.toUpperCase() || null;
        const postalCode = text(raw.postal_code)?.replace(/\D/g, '') || null;
        return {
            street: text(raw.street),
            address_number: text(raw.address_number),
            address_complement: text(raw.address_complement),
            neighborhood: text(raw.neighborhood),
            city: text(raw.city),
            state,
            postal_code: postalCode && postalCode.length === 8 ? `${postalCode.slice(0, 5)}-${postalCode.slice(5)}` : postalCode,
            formatted_address: text(raw.formatted_address),
            geocode_provider: text(raw.geocode_provider),
            geocode_provider_id: text(raw.geocode_provider_id),
            geocode_quality: text(raw.geocode_quality)?.toUpperCase() || null,
            confirmed: raw.confirmed === true,
        };
    }

    private hasConfirmedOriginAddress(address: DeliveryOriginAddress | null): boolean {
        if (!address || !address.confirmed) return false;
        return [address.street, address.address_number, address.neighborhood, address.city, address.state, address.postal_code]
            .every((value) => Boolean(String(value || '').trim()));
    }

    private async requireTenant(tenantId: string): Promise<Tenant> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) throw new HttpException('Restaurante não encontrado.', HttpStatus.NOT_FOUND);
        return tenant;
    }
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export interface MessageTemplates {
    msg_welcome?: string;
    msg_restaurant_closed?: string;
    msg_welcome_table?: string;
    msg_table_request_pending?: string;
    msg_table_approved?: string;
    msg_main_menu?: string;
    msg_invalid_option?: string;
    msg_order_confirmed?: string;
    msg_order_ready?: string;
    msg_order_delivered?: string;
    msg_tab_summary?: string;
    msg_service_request?: string;
    msg_payment_pending?: string;
    msg_payment_confirmed?: string;
    msg_delivery_preparing?: string;
    msg_delivery_in_transit?: string;
    msg_delivery_exception?: string;
    msg_delivery_delivered?: string;
    msg_delivery_rejected?: string;
    msg_delivery_cycle_exhausted?: string;
}

export interface TenantSettings {
    digital_menu?: {
        logo_url?: string;
        cover_url?: string;
        description?: string;
        primary_color?: string;
        accent_color?: string;
    };
    delivery?: {
        enabled?: boolean;
        enabled_at?: string | null;
        expires_at?: string | null;
        permanent?: boolean;
        [key: string]: unknown;
    };
    /** Commercial module flags. Missing attendance keeps legacy tenants active. */
    attendance?: {
        enabled?: boolean;
    };
    /** RETAIL is an independent commercial module and may coexist with restaurant flows. */
    retail?: {
        enabled?: boolean;
        enabled_at?: string | null;
        disabled_at?: string | null;
    };
    /** Storefront for prepared food. Delivery is logistics and stays independent. */
    food_store?: {
        enabled?: boolean;
        enabled_at?: string | null;
        disabled_at?: string | null;
    };
    /** Agenda & Serviços is a standalone capability for salons, clinics and service businesses. */
    appointments?: {
        enabled?: boolean;
        enabled_at?: string | null;
        disabled_at?: string | null;
        expires_at?: string | null;
        permanent?: boolean;
        industry_profile?: 'SALON' | 'SPA' | 'CLINIC' | 'GENERIC';
        timezone?: string;
        min_notice_hours?: number;
        max_advance_days?: number;
        allow_customer_cancellation?: boolean;
        cancellation_limit_hours?: number;
        default_reminder_hours?: number;
    };
    service_mode?: 'COM_MESA' | 'SEM_MESA';
    service_fee_percent?: number;
    split_enabled?: boolean;
    auto_accept_orders?: boolean;
    nps_enabled?: boolean;
    voucher_enabled?: boolean;
    mp_access_token?: string;
    mp_public_key?: string;
    payment_gateway?: {
        provider?: 'NONE' | 'MERCADO_PAGO';
        enabled?: boolean;
        environment?: 'TEST' | 'PRODUCTION';
        public_key?: string;
        access_token_encrypted?: string;
    };
    messages?: MessageTemplates;
    document?: string;
    address?: string;
    opened_at?: string | null;
    opened_by?: string | null;
}

export type EstablishmentType = 'RESTAURANT' | 'MARKET' | 'PHARMACY';

@Entity('tenants')
export class Tenant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    slug: string;

    @Column({ name: 'whatsapp_number', type: 'varchar', length: 20, unique: true })
    whatsappNumber: string;

    @Column({ name: 'waba_id', type: 'varchar', length: 255, nullable: true, unique: true })
    wabaId: string | null;

    @Column({ name: 'meta_token', type: 'text', nullable: true })
    metaToken: string | null;

    @Column({ name: 'wallet_balance', type: 'numeric', precision: 10, scale: 2, default: 0.00 })
    walletBalance: number;

    @Column({ name: 'billing_plan', type: 'varchar', length: 20, default: 'pre_paid' })
    billingPlan: string;

    @Column({ name: 'message_price', type: 'numeric', precision: 10, scale: 2, default: 0.02 })
    messagePrice: number;

    @Column({ type: 'simple-json', nullable: true })
    settings: TenantSettings;

    @Column({ default: true })
    active: boolean;

    @Column({ name: 'is_open', default: false })
    isOpen: boolean;

    @Column({ name: 'establishment_type', type: 'varchar', length: 30, default: 'RESTAURANT' })
    establishmentType: EstablishmentType;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

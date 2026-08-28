import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

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
}

export interface TenantSettings {
    service_mode?: 'COM_MESA' | 'SEM_MESA';
    service_fee_percent?: number;
    split_enabled?: boolean;
    auto_accept_orders?: boolean;
    nps_enabled?: boolean;
    voucher_enabled?: boolean;
    mp_access_token?: string;
    mp_public_key?: string;
    payment_gateway?: PaymentGatewaySettings;
    messages?: MessageTemplates;
    delivery?: {
        enabled?: boolean;
        whatsapp_order_enabled?: boolean;
        whatsapp_order_mode?: 'HYBRID' | 'DELIVERY_ONLY';
        enabled_at?: string | null;
        expires_at?: string | null;
        permanent?: boolean;
        disabled_at?: string | null;
    };
    /** Missing attendance is treated as enabled for backwards compatibility. */
    attendance?: {
        enabled?: boolean;
    };
    /** RETAIL is an independent commercial module and may coexist with restaurant flows. */
    retail?: {
        enabled?: boolean;
        enabled_at?: string | null;
        disabled_at?: string | null;
    };
    /** Digital storefront for prepared food/cardápio. */
    food_store?: {
        enabled?: boolean;
        enabled_at?: string | null;
        disabled_at?: string | null;
    };
    appointments?: {
        enabled?: boolean;
        enabled_at?: string | null;
        disabled_at?: string | null;
        expires_at?: string | null;
        permanent?: boolean;
        industry_profile?: 'SALON' | 'SPA' | 'CLINIC' | 'GENERIC';
    };
}

export interface PaymentGatewaySettings {
    provider?: 'NONE' | 'MERCADO_PAGO';
    enabled?: boolean;
    environment?: '' | 'TEST' | 'PRODUCTION';
    public_key?: string;
    access_token_encrypted?: string;
    profile_id?: string;
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

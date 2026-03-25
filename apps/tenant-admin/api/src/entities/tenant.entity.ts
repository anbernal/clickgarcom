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
    msg_tab_summary?: string;
    msg_service_request?: string;
    msg_payment_pending?: string;
    msg_payment_confirmed?: string;
}

export interface TenantSettings {
    service_fee_percent?: number;
    split_enabled?: boolean;
    auto_accept_orders?: boolean;
    nps_enabled?: boolean;
    voucher_enabled?: boolean;
    mp_access_token?: string;
    mp_public_key?: string;
    messages?: MessageTemplates;
    document?: string;
    address?: string;
}

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

    @Column({ name: 'waba_id', type: 'varchar', length: 255, nullable: true })
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

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

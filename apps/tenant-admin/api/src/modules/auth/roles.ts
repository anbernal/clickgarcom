export enum TenantUserRole {
    Admin = 'ADMIN',
    Manager = 'MANAGER',
    Waiter = 'WAITER',
    Kitchen = 'KITCHEN',
    Bar = 'BAR',
    Cashier = 'CASHIER',
    Driver = 'DRIVER',
    Dispatcher = 'DISPATCHER',
}

export const TENANT_ROLE_METADATA_KEY = 'tenant_roles';

const ROLE_ALIASES: Record<string, TenantUserRole> = {
    ADMINISTRATOR: TenantUserRole.Admin,
    GERENTE: TenantUserRole.Manager,
    MANAGER: TenantUserRole.Manager,
    WAITER: TenantUserRole.Waiter,
    ATENDENTE: TenantUserRole.Waiter,
    SALAO: TenantUserRole.Waiter,
    GARCOM: TenantUserRole.Waiter,
    GARÇOM: TenantUserRole.Waiter,
    KITCHEN: TenantUserRole.Kitchen,
    COZINHA: TenantUserRole.Kitchen,
    BAR: TenantUserRole.Bar,
    CASHIER: TenantUserRole.Cashier,
    CAIXA: TenantUserRole.Cashier,
    DRIVER: TenantUserRole.Driver,
    ENTREGADOR: TenantUserRole.Driver,
    MOTORISTA: TenantUserRole.Driver,
    DISPATCHER: TenantUserRole.Dispatcher,
    DESPACHANTE: TenantUserRole.Dispatcher,
};

export const SUPPORTED_TENANT_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Kitchen,
    TenantUserRole.Bar,
    TenantUserRole.Cashier,
    TenantUserRole.Driver,
    TenantUserRole.Dispatcher,
] as const;

export const TENANT_FULL_ACCESS_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
] as const;

export const TENANT_AUTHENTICATED_ROLES = [...SUPPORTED_TENANT_ROLES] as const;

export const TENANT_MENU_READ_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Kitchen,
    TenantUserRole.Bar,
    TenantUserRole.Cashier,
] as const;

export const TENANT_MENU_WRITE_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

export const TENANT_ORDER_READ_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Kitchen,
    TenantUserRole.Bar,
] as const;

export const TENANT_ORDER_WRITE_ROLES = [...TENANT_ORDER_READ_ROLES] as const;

export const TENANT_ORDER_CANCEL_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
] as const;

export const TENANT_MANUAL_ORDER_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
] as const;

export const TENANT_TABLE_READ_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Cashier,
] as const;

export const TENANT_TAB_OPERATION_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
] as const;

export const TENANT_TABLE_WRITE_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

export const TENANT_FLOOR_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
] as const;

export const TENANT_SETTLEMENT_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Cashier,
] as const;

export const TENANT_CLOSED_TAB_MUTATION_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

export const TENANT_REPORT_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
] as const;

export const TENANT_WALLET_ROLES = [...TENANT_REPORT_ROLES] as const;

export const TENANT_BOT_CONFIG_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;
export const TENANT_PURCHASE_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

/**
 * Delivery permission groups. The driver group is intentionally separate from
 * read/dispatch groups: service methods must still scope a driver to its own
 * assigned delivery, but this matrix prevents accidental access to unrelated
 * administrative routes.
 */
export const TENANT_DELIVERY_READ_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Dispatcher,
] as const;

export const TENANT_DELIVERY_DISPATCH_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Dispatcher,
] as const;

export const TENANT_DELIVERY_SETTINGS_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

export const TENANT_DELIVERY_OVERRIDE_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

export const TENANT_DELIVERY_DRIVER_ROLES = [TenantUserRole.Driver] as const;

export const TENANT_DELIVERY_REPORT_ROLES = [...TENANT_REPORT_ROLES] as const;

/** Agenda & Serviços keeps operational use separate from configuration. */
export const TENANT_APPOINTMENTS_READ_ROLES = [
    TenantUserRole.Admin, TenantUserRole.Manager, TenantUserRole.Waiter, TenantUserRole.Cashier,
] as const;
export const TENANT_APPOINTMENTS_OPERATE_ROLES = [
    TenantUserRole.Admin, TenantUserRole.Manager, TenantUserRole.Waiter,
] as const;
export const TENANT_APPOINTMENTS_CONFIG_ROLES = [...TENANT_FULL_ACCESS_ROLES] as const;

export function normalizeTenantRole(role: unknown): string {
    const rawRole = String(role || '')
        .trim()
        .toUpperCase();

    if (!rawRole) {
        return '';
    }

    return ROLE_ALIASES[rawRole] || rawRole;
}

export function buildTenantRoleMetadata() {
    return {
        supported_roles: [...SUPPORTED_TENANT_ROLES],
        aliases: {
            GERENTE: TenantUserRole.Manager,
            ATENDENTE: TenantUserRole.Waiter,
            SALAO: TenantUserRole.Waiter,
            GARCOM: TenantUserRole.Waiter,
            'GARÇOM': TenantUserRole.Waiter,
            COZINHA: TenantUserRole.Kitchen,
            CAIXA: TenantUserRole.Cashier,
            ENTREGADOR: TenantUserRole.Driver,
            MOTORISTA: TenantUserRole.Driver,
            DISPATCHER: TenantUserRole.Dispatcher,
            DESPACHANTE: TenantUserRole.Dispatcher,
        },
        route_groups: {
            full_access: [...TENANT_FULL_ACCESS_ROLES],
            menu_read: [...TENANT_MENU_READ_ROLES],
            menu_write: [...TENANT_MENU_WRITE_ROLES],
            order_read_write: [...TENANT_ORDER_WRITE_ROLES],
            order_cancel: [...TENANT_ORDER_CANCEL_ROLES],
            manual_order: [...TENANT_MANUAL_ORDER_ROLES],
            table_read: [...TENANT_TABLE_READ_ROLES],
            tab_operations: [...TENANT_TAB_OPERATION_ROLES],
            table_write: [...TENANT_TABLE_WRITE_ROLES],
            floor_operations: [...TENANT_FLOOR_ROLES],
            settlement: [...TENANT_SETTLEMENT_ROLES],
            reports: [...TENANT_REPORT_ROLES],
            wallet: [...TENANT_WALLET_ROLES],
            bot_config: [...TENANT_BOT_CONFIG_ROLES],
            purchases: [...TENANT_PURCHASE_ROLES],
            delivery_read: [...TENANT_DELIVERY_READ_ROLES],
            delivery_dispatch: [...TENANT_DELIVERY_DISPATCH_ROLES],
            delivery_settings: [...TENANT_DELIVERY_SETTINGS_ROLES],
            delivery_override: [...TENANT_DELIVERY_OVERRIDE_ROLES],
            delivery_driver: [...TENANT_DELIVERY_DRIVER_ROLES],
            delivery_reports: [...TENANT_DELIVERY_REPORT_ROLES],
            appointments_read: [...TENANT_APPOINTMENTS_READ_ROLES],
            appointments_operate: [...TENANT_APPOINTMENTS_OPERATE_ROLES],
            appointments_config: [...TENANT_APPOINTMENTS_CONFIG_ROLES],
            appointments_automation_publish: [...TENANT_APPOINTMENTS_CONFIG_ROLES],
        },
    };
}

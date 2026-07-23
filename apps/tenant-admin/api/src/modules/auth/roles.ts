export enum TenantUserRole {
    Admin = 'ADMIN',
    Manager = 'MANAGER',
    Waiter = 'WAITER',
    Kitchen = 'KITCHEN',
    Bar = 'BAR',
    Cashier = 'CASHIER',
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
};

export const SUPPORTED_TENANT_ROLES = [
    TenantUserRole.Admin,
    TenantUserRole.Manager,
    TenantUserRole.Waiter,
    TenantUserRole.Kitchen,
    TenantUserRole.Bar,
    TenantUserRole.Cashier,
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
        },
        route_groups: {
            full_access: [...TENANT_FULL_ACCESS_ROLES],
            menu_read: [...TENANT_MENU_READ_ROLES],
            menu_write: [...TENANT_MENU_WRITE_ROLES],
            order_read_write: [...TENANT_ORDER_WRITE_ROLES],
            order_cancel: [...TENANT_ORDER_CANCEL_ROLES],
            table_read: [...TENANT_TABLE_READ_ROLES],
            tab_operations: [...TENANT_TAB_OPERATION_ROLES],
            table_write: [...TENANT_TABLE_WRITE_ROLES],
            floor_operations: [...TENANT_FLOOR_ROLES],
            settlement: [...TENANT_SETTLEMENT_ROLES],
            reports: [...TENANT_REPORT_ROLES],
            wallet: [...TENANT_WALLET_ROLES],
            bot_config: [...TENANT_BOT_CONFIG_ROLES],
            purchases: [...TENANT_PURCHASE_ROLES],
        },
    };
}

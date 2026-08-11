import { KdsOrder, KdsOrderItem, KdsStation, OrderStatus } from '../types';

type SlaConfig = Record<'PENDING' | 'ACCEPTED' | 'READY', { warningMinutes: number; criticalMinutes: number; label: string }>;

export function normalizeRole(role?: string) {
  const value = String(role || '').trim().toUpperCase();
  if (['COZINHA', 'KITCHEN'].includes(value)) return 'KITCHEN';
  if (value === 'BAR') return 'BAR';
  if (['GERENTE', 'MANAGER'].includes(value)) return 'MANAGER';
  if (['GARCOM', 'GARÇOM', 'ATENDENTE', 'SALAO', 'WAITER'].includes(value)) return 'WAITER';
  return value;
}

export function getStationForRole(role?: string): KdsStation {
  return normalizeRole(role) === 'BAR' ? 'BAR' : 'KITCHEN';
}

export function normalizeOrder(order: any): KdsOrder {
  return {
    ...order,
    tenant_id: order.tenant_id || order.tenantId,
    tab_id: order.tab_id || order.tabId || null,
    batch_id: order.batch_id || order.batchId || null,
    batch_display_code: order.batch_display_code || order.batchDisplayCode || null,
    table_number: order.table_number || order.tableNumber || null,
    destination: String(order.destination || 'KITCHEN').toUpperCase() === 'BAR' ? 'BAR' : 'KITCHEN',
    status: String(order.status || 'PENDING').toUpperCase() as OrderStatus,
    notes: normalizeText(order.notes),
    created_at: order.created_at || order.createdAt || new Date().toISOString(),
    accepted_at: order.accepted_at || order.acceptedAt || null,
    ready_at: order.ready_at || order.readyAt || null,
    delivered_at: order.delivered_at || order.deliveredAt || null,
    canceled_at: order.canceled_at || order.canceledAt || null,
    items: Array.isArray(order.items) ? order.items.map((item: any) => ({
      ...item,
      menu_item_id: item.menu_item_id || item.menuItemId || null,
      menu_item_name: item.menu_item_name || item.menuItemName || item.item_name_snapshot || item.itemNameSnapshot || null,
      item_name_snapshot: item.item_name_snapshot || item.itemNameSnapshot || null,
      quantity: Number(item.quantity || 0),
      observations: normalizeText(item.observations),
      selected_options: Array.isArray(item.selected_options) ? item.selected_options : Array.isArray(item.selectedOptions) ? item.selectedOptions : [],
    })).filter((item: KdsOrderItem) => item.quantity > 0) : [],
  } as KdsOrder;
}

export function getItemName(item: KdsOrderItem, itemNames: Record<string, string>) {
  if (item.menu_item_name) return item.menu_item_name;
  if (item.item_name_snapshot) return item.item_name_snapshot;
  if (item.menu_item_id && itemNames[item.menu_item_id]) return itemNames[item.menu_item_id];
  return 'Item';
}

export function getDisplayOrderCode(order: KdsOrder) {
  return String(order.batch_display_code || order.batch_id?.slice(-4) || order.id.slice(-4)).toUpperCase();
}

export function getOrderStageStart(order: KdsOrder) {
  if (order.status === 'READY') return order.ready_at || order.created_at;
  if (order.status === 'ACCEPTED') return order.accepted_at || order.created_at;
  return order.created_at;
}

export function getElapsed(start: string, status: OrderStatus, sla: SlaConfig) {
  const stage = status === 'ACCEPTED' ? 'ACCEPTED' : status === 'READY' ? 'READY' : 'PENDING';
  const config = sla[stage];
  const elapsedMs = Math.max(0, Date.now() - new Date(start).getTime());
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const severity = minutes >= config.criticalMinutes ? 'critical' : minutes >= config.warningMinutes ? 'warning' : 'normal';
  return {
    text: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    label: `${config.label} · limite ${config.criticalMinutes} min`,
    severity,
  };
}

function normalizeText(value: unknown) {
  const text = String(value || '').trim();
  return ['<nil>', 'null', 'undefined'].includes(text.toLowerCase()) ? '' : text;
}

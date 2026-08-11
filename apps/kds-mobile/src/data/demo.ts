import { KdsOrder, KdsSession } from '../types';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const DEMO_SESSION: KdsSession = {
  accessToken: 'demo-token',
  apiBaseUrl: 'https://demo.clickgarcom.local/admin/api/v1',
  wsUrl: 'wss://demo.clickgarcom.local/ws/kds',
  mode: 'demo',
  user: { id: 'demo-user', name: 'Marina Atendimento', email: 'demo@clickgarcom.local', role: 'WAITER', tenant_id: 'demo-tenant', tenant_name: 'Restaurante Aurora' },
};

export const DEMO_SLA = {
  PENDING: { warningMinutes: 3, criticalMinutes: 5, label: 'Aceite' },
  ACCEPTED: { warningMinutes: 12, criticalMinutes: 20, label: 'Preparo' },
  READY: { warningMinutes: 4, criticalMinutes: 8, label: 'Entrega' },
};

export const DEMO_ORDERS: KdsOrder[] = [
  { id: 'order-101', batch_display_code: '1042', table_number: '07', destination: 'KITCHEN', status: 'PENDING', created_at: minutesAgo(7), notes: 'Alergia a cebola. Caprichar no ponto da carne.', items: [{ id: '101-1', quantity: 2, menu_item_name: 'Filé à parmegiana', observations: 'Sem cebola' }, { id: '101-2', quantity: 2, menu_item_name: 'Arroz branco' }, { id: '101-3', quantity: 1, menu_item_name: 'Batata frita' }] },
  { id: 'order-102', batch_display_code: '1043', table_number: '12', destination: 'KITCHEN', status: 'PENDING', created_at: minutesAgo(2), items: [{ id: '102-1', quantity: 1, menu_item_name: 'Risoto de cogumelos' }, { id: '102-2', quantity: 1, menu_item_name: 'Salada da casa', observations: 'Molho à parte' }] },
  { id: 'order-103', batch_display_code: '1039', table_number: '04', destination: 'KITCHEN', status: 'ACCEPTED', created_at: minutesAgo(19), accepted_at: minutesAgo(14), items: [{ id: '103-1', quantity: 1, menu_item_name: 'Salmão grelhado' }, { id: '103-2', quantity: 1, menu_item_name: 'Legumes na manteiga' }] },
  { id: 'order-104', batch_display_code: '1038', table_number: '15', destination: 'KITCHEN', status: 'READY', created_at: minutesAgo(22), accepted_at: minutesAgo(19), ready_at: minutesAgo(5), items: [{ id: '104-1', quantity: 3, menu_item_name: 'Hambúrguer artesanal' }, { id: '104-2', quantity: 3, menu_item_name: 'Batata rústica' }] },
  { id: 'order-105', batch_display_code: '1044', table_number: '08', destination: 'BAR', status: 'PENDING', created_at: minutesAgo(1), items: [{ id: '105-1', quantity: 2, menu_item_name: 'Caipirinha de limão' }, { id: '105-2', quantity: 1, menu_item_name: 'Gin tônica' }] },
  { id: 'order-106', batch_display_code: '1040', table_number: '03', destination: 'BAR', status: 'ACCEPTED', created_at: minutesAgo(9), accepted_at: minutesAgo(6), items: [{ id: '106-1', quantity: 4, menu_item_name: 'Chopp pilsen 400ml' }] },
];

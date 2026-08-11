const productionApiBaseUrl = 'https://clickgarcom.servicoswebia.com.br/admin/api/v1';
const productionKdsWsUrl = 'wss://clickgarcom.servicoswebia.com.br/ws/kds';

export const DEFAULT_ADMIN_API_BASE_URL = (
  process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL || productionApiBaseUrl
).trim().replace(/\/+$/, '');

export const DEFAULT_KDS_WS_URL = (
  process.env.EXPO_PUBLIC_KDS_WS_URL || productionKdsWsUrl
).trim().replace(/\/+$/, '');

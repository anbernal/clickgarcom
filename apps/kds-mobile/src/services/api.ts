import {
  ApiEnvelope,
  ApiError,
  CloseBillRequest,
  KdsMenuItem,
  KdsOrder,
  KdsSession,
  KdsUser,
  OrderStatus,
  SalonRequest,
  SalonTab,
  SalonTable,
  WaiterChat,
  WaiterChatMessage,
} from '../types';

type LoginInput = { email: string; password: string; apiBaseUrl: string; wsUrl: string };
type LoginResponse = { access_token: string; user: KdsUser };

export async function login(input: LoginInput): Promise<KdsSession> {
  const apiBaseUrl = normalizeApiBaseUrl(input.apiBaseUrl);
  const response = await request<LoginResponse>(apiBaseUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: input.email.trim(), password: input.password }),
  });

  if (!response.access_token || !response.user?.tenant_id) {
    throw new ApiError('A API retornou uma sessão inválida.');
  }

  return {
    accessToken: response.access_token,
    user: response.user,
    apiBaseUrl,
    wsUrl: normalizeWsUrl(input.wsUrl),
    mode: 'live',
  };
}

export function getOrders(session: KdsSession) {
  return request<KdsOrder[]>(session.apiBaseUrl, '/orders?status=PENDING,ACCEPTED,READY', { token: session.accessToken });
}

export function getMenu(session: KdsSession) {
  return request<KdsMenuItem[]>(session.apiBaseUrl, '/menu', { token: session.accessToken });
}

export function updateOrderStatus(session: KdsSession, orderId: string, status: OrderStatus, prepMinutes?: number) {
  return request<KdsOrder>(session.apiBaseUrl, `/orders/${orderId}/status`, {
    method: 'PATCH',
    token: session.accessToken,
    body: JSON.stringify({ status, ...(prepMinutes ? { prep_minutes: prepMinutes } : {}) }),
  });
}

export function getSalonData(session: KdsSession) {
  return Promise.all([
    request<SalonTable[]>(session.apiBaseUrl, '/tables', { token: session.accessToken }),
    request<SalonTab[]>(session.apiBaseUrl, '/tables/tabs/open', { token: session.accessToken }),
    request<SalonRequest[]>(session.apiBaseUrl, '/tables/requests/pending', { token: session.accessToken }),
    request<CloseBillRequest[]>(session.apiBaseUrl, '/tables/waiter/close-requests', { token: session.accessToken }),
    request<WaiterChat[]>(session.apiBaseUrl, '/tables/waiter/chats/open', { token: session.accessToken }),
  ]).then(([tables, tabs, requests, closeRequests, chats]) => ({ tables, tabs, requests, closeRequests, chats }));
}

export function approveSalonRequest(session: KdsSession, requestId: string, tableId?: string) {
  return request(session.apiBaseUrl, `/tables/requests/${requestId}/approve`, {
    method: 'POST', token: session.accessToken, body: JSON.stringify(tableId ? { tableId } : {}),
  });
}

export function rejectSalonRequest(session: KdsSession, requestId: string) {
  return request(session.apiBaseUrl, `/tables/requests/${requestId}/reject`, { method: 'POST', token: session.accessToken });
}

export function finalizeCloseRequest(session: KdsSession, requestId: string) {
  return request(session.apiBaseUrl, `/tables/waiter/close-requests/${requestId}/finalize`, { method: 'POST', token: session.accessToken });
}

export function openSalonTab(session: KdsSession, input: { userPhone?: string; customerInstagram?: string; tableId?: string }) {
  return request<SalonTab>(session.apiBaseUrl, '/tables/tabs/open', {
    method: 'POST', token: session.accessToken,
    body: JSON.stringify({ user_phone: input.userPhone, customer_instagram: input.customerInstagram, table_id: input.tableId }),
  });
}

export function finalizeSalonTab(session: KdsSession, tabId: string, paymentMethod?: string) {
  return request(session.apiBaseUrl, `/tables/tabs/${tabId}/finalize`, {
    method: 'POST', token: session.accessToken, body: JSON.stringify(paymentMethod ? { manual_payment_method: paymentMethod } : {}),
  });
}

export function createManualOrder(session: KdsSession, input: { tabId: string; menuItemId: string; quantity: number; observations?: string }) {
  return request(session.apiBaseUrl, '/orders/manual', {
    method: 'POST', token: session.accessToken,
    body: JSON.stringify({
      tab_id: input.tabId,
      items: [{ menu_item_id: input.menuItemId, quantity: input.quantity, observations: input.observations }],
    }),
  });
}

export function getWaiterChatMessages(session: KdsSession, chatId: string) {
  return request<{ messages: WaiterChatMessage[] }>(session.apiBaseUrl, `/tables/waiter/chats/${chatId}/messages`, { token: session.accessToken });
}

export function sendWaiterChatMessage(session: KdsSession, chatId: string, message: string) {
  return request(session.apiBaseUrl, `/tables/waiter/chats/${chatId}/messages`, {
    method: 'POST', token: session.accessToken, body: JSON.stringify({ message }),
  });
}

export function closeWaiterChat(session: KdsSession, chatId: string) {
  return request(session.apiBaseUrl, `/tables/waiter/chats/${chatId}/close`, { method: 'POST', token: session.accessToken });
}

async function request<T>(baseUrl: string, path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | T | null;
  if (!response.ok) {
    const message = isEnvelopeError(payload) ? payload.error.message : null;
    throw new ApiError(message || `Não foi possível concluir a solicitação (${response.status}).`, response.status);
  }
  if (isEnvelopeSuccess<T>(payload)) return payload.data;
  return payload as T;
}

function isEnvelopeSuccess<T>(payload: unknown): payload is Extract<ApiEnvelope<T>, { success: true }> {
  return Boolean(payload && typeof payload === 'object' && (payload as { success?: unknown }).success === true && 'data' in payload);
}

function isEnvelopeError(payload: unknown): payload is Extract<ApiEnvelope<never>, { success: false }> {
  return Boolean(payload && typeof payload === 'object' && (payload as { success?: unknown }).success === false && 'error' in payload);
}

function normalizeApiBaseUrl(value: string) {
  const baseUrl = value.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new ApiError('Informe a URL da API administrativa.');
  return baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
}

function normalizeWsUrl(value: string) {
  const wsUrl = value.trim().replace(/\/+$/, '');
  if (!wsUrl) throw new ApiError('Informe a URL do WebSocket KDS.');
  if (!/^wss?:\/\//.test(wsUrl)) throw new ApiError('A URL do WebSocket deve iniciar com ws:// ou wss://.');
  return wsUrl;
}

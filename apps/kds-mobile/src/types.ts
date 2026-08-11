export type KdsStation = 'KITCHEN' | 'BAR';
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'DELIVERED' | 'CANCELED';
export type StationConnection = 'online' | 'offline' | 'reconnecting' | 'demo';

export type KdsUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenant_id: string;
  tenant_name?: string | null;
};

export type KdsSession = {
  accessToken: string;
  user: KdsUser;
  apiBaseUrl: string;
  wsUrl: string;
  mode?: 'live' | 'demo';
};

export type KdsOrderItem = {
  id: string;
  menu_item_id?: string | null;
  menu_item_name?: string | null;
  item_name_snapshot?: string | null;
  quantity: number;
  observations?: string | null;
  selected_options?: Array<{ group_name?: string; option_name?: string }>;
};

export type KdsOrder = {
  id: string;
  tenant_id?: string;
  tab_id?: string | null;
  batch_id?: string | null;
  batch_display_code?: string | null;
  table_number?: string | null;
  destination: KdsStation;
  status: OrderStatus;
  notes?: string | null;
  created_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  canceled_at?: string | null;
  items: KdsOrderItem[];
};

export type KdsMenuItem = { id: string; name: string };
export type SalonTable = {
  id: string;
  number: string;
  capacity?: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | string;
  activeTabs?: Array<{ id: string; publicCode?: string; total?: number }>;
};

export type SalonTab = {
  id: string;
  publicCode: string;
  userPhone?: string | null;
  customerInstagram?: string | null;
  tableId?: string | null;
  tableNumber?: string | null;
  status: string;
  serviceMode?: string;
  total: number;
  paidAmount?: number;
  openedAt: string;
  openedByUserName?: string | null;
};

export type SalonRequest = {
  id: string;
  userPhone?: string | null;
  tableId?: string | null;
  table_id?: string | null;
  table?: { number?: string } | null;
  tableNumber?: string | null;
  paxCount?: number;
  pax_count?: number;
  createdAt?: string;
  created_at?: string;
};

export type CloseBillRequest = {
  id: string;
  tabId?: string | null;
  tableId?: string | null;
  tableNumber?: string | null;
  userPhone?: string | null;
  createdAt: string;
  total: number;
  paidAmount: number;
  amountDue: number;
};

export type WaiterChat = {
  id: string;
  userPhone: string;
  status: string;
  openedAt: string;
  lastMessageAt?: string | null;
  tableNumber?: string | null;
  lastMessage?: string | null;
  lastSenderType?: string | null;
};

export type WaiterChatMessage = {
  id: string;
  senderType: string;
  senderName?: string | null;
  message: string;
  createdAt: string;
};
export type ApiEnvelope<T> = { success: true; data: T } | { success: false; error: { message?: string } };
export type KdsEvent = { type: string; tenant_id?: string; data?: KdsOrder };

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

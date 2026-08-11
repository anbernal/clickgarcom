import { CloseBillRequest, SalonRequest, SalonTab, SalonTable, WaiterChat, WaiterChatMessage } from '../types';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const DEMO_TABLES: SalonTable[] = [
  { id: 'table-1', number: '04', capacity: 4, status: 'OCCUPIED' },
  { id: 'table-2', number: '07', capacity: 4, status: 'OCCUPIED' },
  { id: 'table-3', number: '08', capacity: 2, status: 'AVAILABLE' },
  { id: 'table-4', number: '12', capacity: 6, status: 'AVAILABLE' },
  { id: 'table-5', number: '15', capacity: 4, status: 'CLEANING' },
];

export const DEMO_TABS: SalonTab[] = [
  { id: 'tab-1042', publicCode: '1042', userPhone: '(11) 99999-4444', tableId: 'table-2', tableNumber: '07', status: 'OPEN', total: 136, paidAmount: 0, openedAt: minutesAgo(42), openedByUserName: 'Marina' },
  { id: 'tab-1043', publicCode: '1043', customerInstagram: '@ana.lima', tableId: 'table-4', tableNumber: '12', status: 'OPEN', total: 78.5, paidAmount: 0, openedAt: minutesAgo(16), openedByUserName: 'Marina' },
];

export const DEMO_REQUESTS: SalonRequest[] = [
  { id: 'request-1', userPhone: '(11) 98888-1111', paxCount: 2, createdAt: minutesAgo(6) },
  { id: 'request-2', userPhone: '(11) 97777-2222', tableId: 'table-3', table: { number: '08' }, paxCount: 2, createdAt: minutesAgo(3) },
];

export const DEMO_CLOSE_REQUESTS: CloseBillRequest[] = [
  { id: 'close-1', tabId: 'tab-1042', tableId: 'table-2', tableNumber: '07', userPhone: '(11) 99999-4444', createdAt: minutesAgo(5), total: 136, paidAmount: 0, amountDue: 136 },
];

export const DEMO_CHATS: WaiterChat[] = [
  { id: 'chat-1', userPhone: '(11) 99999-4444', status: 'OPEN', openedAt: minutesAgo(12), lastMessageAt: minutesAgo(2), tableNumber: '07', lastMessage: 'Podem trazer mais um copo, por favor?', lastSenderType: 'CUSTOMER' },
];

export const DEMO_CHAT_MESSAGES: WaiterChatMessage[] = [
  { id: 'message-1', senderType: 'CUSTOMER', senderName: 'Cliente', message: 'Podem trazer mais um copo, por favor?', createdAt: minutesAgo(2) },
];

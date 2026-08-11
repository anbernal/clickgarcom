import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  approveSalonRequest,
  closeWaiterChat,
  createManualOrder,
  finalizeCloseRequest,
  finalizeSalonTab,
  getWaiterChatMessages,
  openSalonTab,
  rejectSalonRequest,
  sendWaiterChatMessage,
} from '../services/api';
import {
  CloseBillRequest, KdsMenuItem, KdsOrder, KdsSession, SalonRequest, SalonTab, SalonTable, WaiterChat, WaiterChatMessage,
} from '../types';
import { getDisplayOrderCode } from '../utils/kds';

type SalonView = 'now' | 'tabs' | 'tables' | 'chats';
type SalonData = { tables: SalonTable[]; tabs: SalonTab[]; requests: SalonRequest[]; closeRequests: CloseBillRequest[]; chats: WaiterChat[] };

const elapsedText = (value?: string | null) => {
  if (!value) return 'agora';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes < 1 ? 'agora' : `há ${minutes} min`;
};
const money = (value: number) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const emptyData: SalonData = { tables: [], tabs: [], requests: [], closeRequests: [], chats: [] };

export function SalonScreen({
  session, orders, menuItems, data = emptyData, refreshing, onRefresh, onNotice,
}: {
  session: KdsSession;
  orders: KdsOrder[];
  menuItems: KdsMenuItem[];
  data?: SalonData;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [view, setView] = useState<SalonView>('now');
  const [busy, setBusy] = useState<string | null>(null);
  const [newTabVisible, setNewTabVisible] = useState(false);
  const [requestToAssign, setRequestToAssign] = useState<SalonRequest | null>(null);
  const [selectedTab, setSelectedTab] = useState<SalonTab | null>(null);
  const [selectedChat, setSelectedChat] = useState<WaiterChat | null>(null);
  const [messages, setMessages] = useState<WaiterChatMessage[]>([]);
  const isDemo = session.mode === 'demo';
  const readyOrders = orders.filter((order) => order.status === 'READY');
  const counters = { now: readyOrders.length + data.requests.length + data.closeRequests.length, tabs: data.tabs.length, tables: data.tables.filter((table) => table.status === 'AVAILABLE').length, chats: data.chats.length };

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      if (isDemo) {
        onNotice(`${done} (demonstração).`);
      } else {
        await action();
        await onRefresh();
        onNotice(done);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(null);
    }
  };

  const openChat = async (chat: WaiterChat) => {
    setSelectedChat(chat);
    if (isDemo) { setMessages([{ id: 'demo', senderType: 'CUSTOMER', senderName: 'Cliente', message: chat.lastMessage || '', createdAt: chat.lastMessageAt || chat.openedAt }]); return; }
    try {
      const result = await getWaiterChatMessages(session, chat.id);
      setMessages(result.messages || []);
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Não foi possível abrir a conversa.'); }
  };

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <View style={styles.titleIdentity}><Text numberOfLines={1} style={styles.eyebrow}>{session.user.tenant_name || 'Click Garçom'} · OPERAÇÃO</Text><Text style={styles.title}>Salão</Text></View>
        <Pressable accessibilityLabel="Atualizar Salão" onPress={() => { void onRefresh(); }} style={styles.refresh}>{refreshing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.refreshText}>↻</Text>}</Pressable>
      </View>
      <ScrollView horizontal style={styles.navScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
        {([['now', 'Agora'], ['tabs', 'Comandas'], ['tables', 'Mesas'], ['chats', 'Conversas']] as Array<[SalonView, string]>).map(([key, label]) => <Pressable key={key} onPress={() => setView(key)} style={[styles.navButton, view === key && styles.navButtonActive]}><Text style={[styles.navText, view === key && styles.navTextActive]}>{label} ({counters[key]})</Text></Pressable>)}
      </ScrollView>
      {view === 'now' && <NowView readyOrders={readyOrders} requests={data.requests} closeRequests={data.closeRequests} busy={busy} onDeliver={() => onNotice('Abra o pedido na Estação para confirmar a entrega.')} onApprove={(request) => request.tableId || request.table_id ? setRequestToAssign(request) : void run(`approve-${request.id}`, () => approveSalonRequest(session, request.id), 'Comanda aberta')} onReject={(request) => Alert.alert('Recusar atendimento?', 'O cliente receberá a orientação prevista.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Recusar', style: 'destructive', onPress: () => { void run(`reject-${request.id}`, () => rejectSalonRequest(session, request.id), 'Solicitação recusada'); } }])} onClose={(request) => void run(`close-${request.id}`, () => finalizeCloseRequest(session, request.id), 'Conta finalizada')} />}
      {view === 'tabs' && <TabsView tabs={data.tabs} onNew={() => setNewTabVisible(true)} onOpen={setSelectedTab} />}
      {view === 'tables' && <TablesView tables={data.tables} />}
      {view === 'chats' && <ChatsView chats={data.chats} onOpen={openChat} onClose={(chat) => void run(`chat-${chat.id}`, () => closeWaiterChat(session, chat.id), 'Conversa encerrada')} busy={busy} />}
      <NewTabModal visible={newTabVisible} tables={data.tables} busy={busy === 'new-tab'} onClose={() => setNewTabVisible(false)} onSubmit={(input) => void run('new-tab', () => openSalonTab(session, input), 'Comanda aberta').then(() => setNewTabVisible(false))} />
      <AssignTableModal request={requestToAssign} tables={data.tables} busy={busy === `assign-${requestToAssign?.id}`} onClose={() => setRequestToAssign(null)} onAssign={(tableId) => requestToAssign && void run(`assign-${requestToAssign.id}`, () => approveSalonRequest(session, requestToAssign.id, tableId), 'Mesa alocada').then(() => setRequestToAssign(null))} />
      <TabModal tab={selectedTab} menuItems={menuItems} busy={busy} onClose={() => setSelectedTab(null)} onAddItem={(input) => void run(`item-${input.tabId}`, () => createManualOrder(session, input), 'Lançamento enviado para preparo')} onFinalize={(tab) => Alert.alert('Finalizar comanda?', `Total: ${money(tab.total)}.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Finalizar', onPress: () => { void run(`finalize-${tab.id}`, () => finalizeSalonTab(session, tab.id), 'Comanda finalizada').then(() => setSelectedTab(null)); } }])} />
      <ChatModal chat={selectedChat} messages={messages} busy={busy} onClose={() => setSelectedChat(null)} onSend={(message) => selectedChat && void run(`message-${selectedChat.id}`, () => sendWaiterChatMessage(session, selectedChat.id, message), 'Mensagem enviada').then(() => setMessages((current) => [...current, { id: `${Date.now()}`, senderType: 'STAFF', senderName: session.user.name, message, createdAt: new Date().toISOString() }]))} />
    </View>
  );
}

function NowView({ readyOrders, requests, closeRequests, busy, onDeliver, onApprove, onReject, onClose }: { readyOrders: KdsOrder[]; requests: SalonRequest[]; closeRequests: CloseBillRequest[]; busy: string | null; onDeliver: (order: KdsOrder) => void; onApprove: (request: SalonRequest) => void; onReject: (request: SalonRequest) => void; onClose: (request: CloseBillRequest) => void }) {
  const tasks = useMemo(() => [
    ...readyOrders.map((order) => ({ type: 'delivery' as const, at: order.ready_at || order.created_at, order })),
    ...requests.map((request) => ({ type: 'request' as const, at: request.createdAt || request.created_at || '', request })),
    ...closeRequests.map((request) => ({ type: 'close' as const, at: request.createdAt, request })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()), [readyOrders, requests, closeRequests]);
  if (!tasks.length) return <Empty icon="✓" text="Nenhuma ação urgente agora" />;
  return <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.list}>{tasks.map((task) => {
    if (task.type === 'delivery') return <ActionCard key={`o-${task.order.id}`} icon={task.order.destination === 'BAR' ? '🍹' : '🍽'} title={`Entregar · Pedido #${getDisplayOrderCode(task.order)}`} detail={`${task.order.table_number ? `Mesa ${task.order.table_number}` : 'Comanda sem mesa'} · pronto ${elapsedText(task.order.ready_at)}`} action="Ver na Estação" onPress={() => onDeliver(task.order)} />;
    if (task.type === 'request') { const r = task.request; return <ActionCard key={`r-${r.id}`} icon="👤" title="Novo atendimento" detail={`${r.userPhone || 'Cliente'} · ${r.paxCount || r.pax_count || '?'} pessoa(s) · ${elapsedText(r.createdAt || r.created_at)}`} action={r.tableId || r.table_id ? 'Alocar mesa' : 'Abrir comanda'} secondary="Recusar" disabled={busy === `approve-${r.id}`} onPress={() => onApprove(r)} onSecondary={() => onReject(r)} />; }
    const r = task.request; return <ActionCard key={`c-${r.id}`} icon="💰" title="Fechar conta" detail={`${r.tableNumber ? `Mesa ${r.tableNumber}` : r.userPhone || 'Comanda'} · ${money(r.amountDue)} · ${elapsedText(r.createdAt)}`} action="Conta finalizada" disabled={busy === `close-${r.id}`} onPress={() => onClose(r)} />;
  })}</ScrollView>;
}

function TabsView({ tabs, onNew, onOpen }: { tabs: SalonTab[]; onNew: () => void; onOpen: (tab: SalonTab) => void }) {
  return <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.list}><Pressable style={styles.newTabButton} onPress={onNew}><Text style={styles.newTabText}>+ Nova comanda</Text></Pressable>{tabs.length ? tabs.map((tab) => <Pressable key={tab.id} style={styles.tabCard} onPress={() => onOpen(tab)}><View style={styles.tabMain}><Text style={styles.tabCode}>Comanda #{tab.publicCode}</Text><Text style={styles.tabMeta}>{tab.tableNumber ? `Mesa ${tab.tableNumber}` : 'Sem mesa'} · {tab.userPhone || tab.customerInstagram || 'Cliente não identificado'}</Text><Text style={styles.tabMeta}>Aberta {elapsedText(tab.openedAt)}</Text></View><View style={styles.tabAmount}><Text style={styles.amount}>{money(tab.total)}</Text><Text style={styles.link}>Gerenciar ›</Text></View></Pressable>) : <Empty icon="▤" text="Nenhuma comanda aberta" />}</ScrollView>;
}

function TablesView({ tables }: { tables: SalonTable[] }) {
  const [filter, setFilter] = useState('ALL');
  const visible = filter === 'ALL' ? tables : tables.filter((table) => table.status === filter);
  return <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.list}><ScrollView horizontal style={styles.filterScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{['ALL', 'AVAILABLE', 'OCCUPIED', 'CLEANING'].map((status) => <Pressable key={status} onPress={() => setFilter(status)} style={[styles.filter, status === filter && styles.filterActive]}><Text style={[styles.filterText, status === filter && styles.filterTextActive]}>{status === 'ALL' ? 'Todas' : status === 'AVAILABLE' ? 'Livres' : status === 'OCCUPIED' ? 'Ocupadas' : 'Limpeza'}</Text></Pressable>)}</ScrollView><View style={styles.tableGrid}>{visible.map((table) => <View key={table.id} style={[styles.tableCard, table.status === 'AVAILABLE' && styles.tableAvailable, table.status === 'OCCUPIED' && styles.tableOccupied]}><Text style={styles.tableNumber}>Mesa {table.number}</Text><Text style={styles.tableStatus}>{table.status === 'AVAILABLE' ? 'Livre' : table.status === 'OCCUPIED' ? 'Ocupada' : 'Em limpeza'}</Text><Text style={styles.tableCapacity}>{table.capacity || '?'} lugares</Text></View>)}</View>{!visible.length && <Empty icon="▦" text="Nenhuma mesa neste filtro" />}</ScrollView>;
}

function ChatsView({ chats, onOpen, onClose, busy }: { chats: WaiterChat[]; onOpen: (chat: WaiterChat) => void; onClose: (chat: WaiterChat) => void; busy: string | null }) {
  return <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.list}>{chats.length ? chats.map((chat) => <View key={chat.id} style={styles.chatCard}><Pressable style={styles.chatBody} onPress={() => onOpen(chat)}><Text style={styles.chatTitle}>{chat.userPhone} · {chat.tableNumber ? `Mesa ${chat.tableNumber}` : 'Sem mesa'}</Text><Text numberOfLines={2} style={styles.chatMessage}>{chat.lastSenderType === 'STAFF' ? 'Equipe: ' : 'Cliente: '}{chat.lastMessage || 'Aguardando mensagem'}</Text><Text style={styles.tabMeta}>Atualizada {elapsedText(chat.lastMessageAt || chat.openedAt)}</Text></Pressable><View style={styles.chatActions}><Pressable onPress={() => onOpen(chat)} style={styles.smallAction}><Text style={styles.smallActionText}>Abrir</Text></Pressable><Pressable disabled={busy === `chat-${chat.id}`} onPress={() => onClose(chat)} style={styles.smallActionDanger}><Text style={styles.smallActionDangerText}>Encerrar</Text></Pressable></View></View>) : <Empty icon="💬" text="Nenhuma conversa em atendimento" />}</ScrollView>;
}

function ActionCard({ icon, title, detail, action, secondary, onPress, onSecondary, disabled }: { icon: string; title: string; detail: string; action: string; secondary?: string; onPress: () => void; onSecondary?: () => void; disabled?: boolean }) { return <View style={styles.actionCard}><Text style={styles.actionIcon}>{icon}</Text><View style={styles.actionContent}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionDetail}>{detail}</Text><View style={styles.actionButtons}>{secondary ? <Pressable style={styles.secondaryButton} onPress={onSecondary}><Text style={styles.secondaryText}>{secondary}</Text></Pressable> : null}<Pressable disabled={disabled} style={[styles.actionButton, disabled && styles.disabled]} onPress={onPress}>{disabled ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{action}</Text>}</Pressable></View></View></View>; }
function Empty({ icon, text }: { icon: string; text: string }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyText}>{text}</Text></View>; }

function NewTabModal({ visible, tables, busy, onClose, onSubmit }: { visible: boolean; tables: SalonTable[]; busy: boolean; onClose: () => void; onSubmit: (input: { userPhone?: string; customerInstagram?: string; tableId?: string }) => void }) {
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tableId, setTableId] = useState<string | undefined>();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nova comanda</Text>
            <Text style={styles.modalCopy}>Mesa e identificação são opcionais.</Text>
            <Field label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Instagram" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
            <Text style={styles.fieldLabel}>Mesa</Text>
            <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
              {[undefined, ...tables.filter((table) => table.status === 'AVAILABLE').map((table) => table.id)].map((id) => <Pressable key={id || 'none'} onPress={() => setTableId(id)} style={[styles.chip, tableId === id && styles.chipActive]}><Text style={[styles.chipText, tableId === id && styles.chipTextActive]}>{id ? `Mesa ${tables.find((table) => table.id === id)?.number}` : 'Sem mesa'}</Text></Pressable>)}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
              <Pressable disabled={busy} onPress={() => onSubmit({ userPhone: phone || undefined, customerInstagram: instagram || undefined, tableId })} style={[styles.submit, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Abrir comanda</Text>}</Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AssignTableModal({ request, tables, busy, onClose, onAssign }: { request: SalonRequest | null; tables: SalonTable[]; busy: boolean; onClose: () => void; onAssign: (tableId: string) => void }) { if (!request) return null; return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.modal}><Text style={styles.modalTitle}>Alocar mesa</Text><Text style={styles.modalCopy}>{request.userPhone || 'Cliente'} · escolha uma mesa disponível</Text><View style={styles.chipWrap}>{tables.filter((table) => table.status === 'AVAILABLE').map((table) => <Pressable key={table.id} disabled={busy} onPress={() => onAssign(table.id)} style={styles.tableSelect}><Text style={styles.tableSelectText}>Mesa {table.number}</Text><Text style={styles.tableSelectCopy}>{table.capacity || '?'} lugares</Text></Pressable>)}</View><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable></View></View></Modal>; }

function TabModal({ tab, menuItems, busy, onClose, onAddItem, onFinalize }: { tab: SalonTab | null; menuItems: KdsMenuItem[]; busy: string | null; onClose: () => void; onAddItem: (input: { tabId: string; menuItemId: string; quantity: number; observations?: string }) => void; onFinalize: (tab: SalonTab) => void }) { const [menuItemId, setMenuItemId] = useState(''); const [quantity, setQuantity] = useState('1'); const [observation, setObservation] = useState(''); if (!tab) return null; const selected = menuItems.find((item) => item.id === menuItemId); return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modal}><Text style={styles.modalTitle}>Comanda #{tab.publicCode}</Text><Text style={styles.modalCopy}>{tab.tableNumber ? `Mesa ${tab.tableNumber}` : 'Sem mesa'} · {tab.userPhone || tab.customerInstagram || 'Cliente não identificado'}</Text><View style={styles.totalBox}><Text style={styles.totalLabel}>CONSUMO ATUAL</Text><Text style={styles.totalValue}>{money(tab.total)}</Text></View><Text style={styles.sectionTitle}>Novo lançamento</Text><ScrollView horizontal contentContainerStyle={styles.chips}>{menuItems.slice(0, 30).map((item) => <Pressable key={item.id} onPress={() => setMenuItemId(item.id)} style={[styles.chip, menuItemId === item.id && styles.chipActive]}><Text style={[styles.chipText, menuItemId === item.id && styles.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView>{menuItems.length > 30 ? <Text style={styles.help}>Mostrando os primeiros 30 itens do cardápio.</Text> : null}<Field label="Quantidade" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" /><Field label="Observação" value={observation} onChangeText={setObservation} /><Pressable disabled={!selected || busy === `item-${tab.id}`} onPress={() => selected && onAddItem({ tabId: tab.id, menuItemId: selected.id, quantity: Math.max(1, Number(quantity) || 1), observations: observation || undefined })} style={[styles.launch, (!selected || busy === `item-${tab.id}`) && styles.disabled]}><Text style={styles.submitText}>{selected ? `Lançar ${selected.name}` : 'Escolha um item'}</Text></Pressable><View style={styles.modalActions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Fechar</Text></Pressable><Pressable disabled={busy === `finalize-${tab.id}`} onPress={() => onFinalize(tab)} style={styles.finalize}><Text style={styles.submitText}>Finalizar</Text></Pressable></View></View></ScrollView></View></Modal>; }

function ChatModal({ chat, messages, busy, onClose, onSend }: { chat: WaiterChat | null; messages: WaiterChatMessage[]; busy: string | null; onClose: () => void; onSend: (message: string) => void }) {
  const [message, setMessage] = useState('');
  if (!chat) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{chat.userPhone}</Text>
          <Text style={styles.modalCopy}>{chat.tableNumber ? `Mesa ${chat.tableNumber}` : 'Conversa de atendimento'}</Text>
          <ScrollView style={styles.thread} contentContainerStyle={styles.threadContent}>{messages.map((item) => <View key={item.id} style={[styles.bubble, item.senderType === 'STAFF' && styles.bubbleStaff]}><Text style={styles.bubbleSender}>{item.senderType === 'STAFF' ? 'Equipe' : item.senderName || 'Cliente'}</Text><Text style={styles.bubbleText}>{item.message}</Text></View>)}</ScrollView>
          <TextInput style={styles.messageInput} value={message} onChangeText={setMessage} placeholder="Digite uma mensagem" placeholderTextColor="#91969e" multiline />
          <Pressable disabled={!message.trim() || busy === `message-${chat.id}`} onPress={() => { const value = message.trim(); if (value) { onSend(value); setMessage(''); } }} style={[styles.submit, (!message.trim() || busy === `message-${chat.id}`) && styles.disabled]}><Text style={styles.submitText}>Enviar mensagem</Text></Pressable>
          <Pressable onPress={onClose} style={styles.closeLink}><Text style={styles.cancelText}>Fechar conversa</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#91969e" {...props} /></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6f8' }, titleRow: { minHeight: 92, backgroundColor: '#2f343c', paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, titleIdentity: { flex: 1 }, eyebrow: { color: '#b8bec8', fontSize: 10, fontWeight: '800', letterSpacing: .8 }, title: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 3 }, refresh: { width: 42, height: 42, backgroundColor: '#464c56', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, refreshText: { color: '#fff', fontSize: 23, fontWeight: '500' }, navScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 68, backgroundColor: '#f5f6f8' }, nav: { paddingHorizontal: 14, paddingVertical: 12, gap: 8, alignItems: 'center' }, navButton: { height: 44, minWidth: 104, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e5e9', borderRadius: 13, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }, navButtonActive: { backgroundColor: '#4f70f5', borderColor: '#4f70f5' }, navText: { color: '#5e646d', fontSize: 12, fontWeight: '900' }, navTextActive: { color: '#fff' }, bodyScroll: { flex: 1 }, list: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 24, gap: 11, flexGrow: 1 }, actionCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e8ec', padding: 15, flexDirection: 'row', gap: 13, shadowColor: '#4d5560', shadowOpacity: .07, shadowRadius: 6, elevation: 2 }, actionIcon: { fontSize: 23 }, actionContent: { flex: 1, gap: 5 }, actionTitle: { color: '#282d33', fontWeight: '900', fontSize: 16 }, actionDetail: { color: '#6d737c', fontSize: 13, lineHeight: 18 }, actionButtons: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }, actionButton: { backgroundColor: '#4f70f5', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' }, actionText: { color: '#fff', fontWeight: '900', fontSize: 12 }, secondaryButton: { borderWidth: 1, borderColor: '#df7a74', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 }, secondaryText: { color: '#be443e', fontWeight: '900', fontSize: 12 }, disabled: { opacity: .55 }, newTabButton: { alignItems: 'center', padding: 15, borderWidth: 1, borderColor: '#4f70f5', borderRadius: 13, backgroundColor: '#edf0ff' }, newTabText: { color: '#4568e8', fontWeight: '900' }, tabCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e8ec', borderRadius: 15, padding: 15, flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, tabMain: { flex: 1 }, tabCode: { color: '#2b3036', fontSize: 16, fontWeight: '900' }, tabMeta: { color: '#767c84', fontSize: 12, marginTop: 5 }, tabAmount: { alignItems: 'flex-end', justifyContent: 'space-between' }, amount: { color: '#2d3339', fontWeight: '900', fontSize: 15 }, link: { color: '#4e72f4', fontWeight: '900', fontSize: 12 }, filterScroll: { flexGrow: 0 }, filters: { gap: 7 }, filter: { backgroundColor: '#e7e9ec', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10 }, filterActive: { backgroundColor: '#34383e' }, filterText: { color: '#666d75', fontWeight: '800', fontSize: 12 }, filterTextActive: { color: '#fff' }, tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, tableCard: { width: '47%', flexGrow: 1, backgroundColor: '#fff6e5', borderRadius: 14, padding: 14, minHeight: 105 }, tableAvailable: { backgroundColor: '#e4f7e8' }, tableOccupied: { backgroundColor: '#e8edff' }, tableNumber: { color: '#2d3238', fontWeight: '900', fontSize: 16 }, tableStatus: { color: '#59616a', fontWeight: '800', marginTop: 7, fontSize: 12 }, tableCapacity: { color: '#737a82', marginTop: 4, fontSize: 11 }, chatCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e8ec', borderRadius: 15, padding: 14 }, chatBody: { gap: 4 }, chatTitle: { color: '#2c3138', fontSize: 15, fontWeight: '900' }, chatMessage: { color: '#626973', fontSize: 13, lineHeight: 18 }, chatActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 11 }, smallAction: { backgroundColor: '#edf0ff', paddingVertical: 9, paddingHorizontal: 11, borderRadius: 9 }, smallActionText: { color: '#496dea', fontSize: 12, fontWeight: '900' }, smallActionDanger: { borderWidth: 1, borderColor: '#e6a09c', paddingVertical: 8, paddingHorizontal: 11, borderRadius: 9 }, smallActionDangerText: { color: '#bd4943', fontSize: 12, fontWeight: '900' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 65 }, emptyIcon: { width: 54, height: 54, borderRadius: 27, lineHeight: 54, textAlign: 'center', backgroundColor: '#e2f7e7', color: '#45a967', fontSize: 28, fontWeight: '900' }, emptyText: { color: '#454c55', fontSize: 16, fontWeight: '900', marginTop: 12, textAlign: 'center' }, overlay: { flex: 1, backgroundColor: 'rgba(18,21,25,.48)', justifyContent: 'flex-end' }, modalScroll: { justifyContent: 'flex-end', flexGrow: 1 }, modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, maxHeight: '92%' }, modalTitle: { color: '#292e35', fontSize: 22, fontWeight: '900' }, modalCopy: { color: '#747b84', fontSize: 13, lineHeight: 18 }, field: { gap: 6 }, fieldLabel: { color: '#555c65', fontWeight: '900', fontSize: 12 }, input: { height: 50, backgroundColor: '#f1f3f5', borderRadius: 11, paddingHorizontal: 12, color: '#272c32', fontSize: 15 }, chips: { gap: 7, paddingVertical: 2 }, chip: { backgroundColor: '#eef0f2', paddingVertical: 9, paddingHorizontal: 11, borderRadius: 9 }, chipActive: { backgroundColor: '#4e72f4' }, chipText: { color: '#5f6670', fontSize: 12, fontWeight: '800' }, chipTextActive: { color: '#fff' }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 }, cancel: { flex: 1, borderWidth: 1, borderColor: '#d8dce0', borderRadius: 11, paddingVertical: 13, alignItems: 'center' }, cancelText: { color: '#5e6670', fontWeight: '900', fontSize: 13 }, submit: { flex: 1, minHeight: 48, backgroundColor: '#4e72f4', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, submitText: { color: '#fff', fontWeight: '900', fontSize: 13 }, chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tableSelect: { backgroundColor: '#e4f7e8', borderRadius: 11, padding: 12, minWidth: 105 }, tableSelectText: { color: '#28653a', fontWeight: '900' }, tableSelectCopy: { color: '#528060', fontSize: 11, marginTop: 3 }, totalBox: { backgroundColor: '#34383e', borderRadius: 12, padding: 13 }, totalLabel: { color: '#bfc4cb', fontWeight: '900', fontSize: 10, letterSpacing: .8 }, totalValue: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 3 }, sectionTitle: { color: '#30353b', fontSize: 15, fontWeight: '900', marginTop: 2 }, help: { color: '#7a8088', fontSize: 11 }, launch: { backgroundColor: '#4e72f4', borderRadius: 11, paddingVertical: 14, alignItems: 'center' }, finalize: { flex: 1, backgroundColor: '#3ba55c', borderRadius: 11, paddingVertical: 13, alignItems: 'center' }, thread: { maxHeight: 300, backgroundColor: '#f3f5f7', borderRadius: 10 }, threadContent: { padding: 10, gap: 8 }, bubble: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: '#fff', padding: 10, borderRadius: 10 }, bubbleStaff: { alignSelf: 'flex-end', backgroundColor: '#dfe7ff' }, bubbleSender: { color: '#5c6470', fontWeight: '900', fontSize: 10 }, bubbleText: { color: '#30363d', marginTop: 3, fontSize: 13 }, messageInput: { minHeight: 60, backgroundColor: '#f1f3f5', borderRadius: 9, padding: 10, textAlignVertical: 'top', color: '#2c3138' }, closeLink: { alignItems: 'center', paddingTop: 2 },
});

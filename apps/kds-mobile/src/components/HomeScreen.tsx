import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  CloseBillRequest,
  KdsOrder,
  KdsSession,
  KdsStation,
  SalonRequest,
  SalonTab,
  SalonTable,
  StationConnection,
  WaiterChat,
} from '../types';
import { getDisplayOrderCode } from '../utils/kds';

type SalonData = {
  tables: SalonTable[];
  tabs: SalonTab[];
  requests: SalonRequest[];
  closeRequests: CloseBillRequest[];
  chats: WaiterChat[];
};

type Destination = KdsStation | 'SALON';
type Priority = {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tone: 'critical' | 'warning' | 'info';
  destination: Destination;
};

const elapsedMinutes = (value?: string | null) => value
  ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  : 0;

export function HomeScreen({
  session,
  connection,
  orders,
  salonData,
  allowedStations,
  canAccessSalon,
  refreshing,
  onRefresh,
  onNavigate,
}: {
  session: KdsSession;
  connection: StationConnection;
  orders: KdsOrder[];
  salonData: SalonData;
  allowedStations: KdsStation[];
  canAccessSalon: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (destination: Destination) => void;
}) {
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const scopedOrders = orders.filter((order) => allowedStations.includes(order.destination));
  const newOrders = scopedOrders.filter((order) => order.status === 'PENDING');
  const preparingOrders = scopedOrders.filter((order) => order.status === 'ACCEPTED');
  const readyOrders = scopedOrders.filter((order) => order.status === 'READY');
  const availableTables = canAccessSalon ? salonData.tables.filter((table) => table.status === 'AVAILABLE').length : 0;
  const operationalAlerts = readyOrders.length
    + (canAccessSalon ? salonData.requests.length + salonData.closeRequests.length + salonData.chats.length : 0);

  const priorities = useMemo(() => {
    const result: Priority[] = [];
    scopedOrders.forEach((order) => {
      const minutes = elapsedMinutes(order.status === 'READY' ? order.ready_at : order.status === 'ACCEPTED' ? order.accepted_at : order.created_at);
      if (order.status === 'PENDING' && minutes >= 5) {
        result.push({ id: `pending-${order.id}`, icon: '!', title: `Pedido #${getDisplayOrderCode(order)} aguardando aceite`, detail: `${order.table_number ? `Mesa ${order.table_number}` : 'Sem mesa'} · ${minutes} min · ${order.destination === 'BAR' ? 'Bar' : 'Cozinha'}`, tone: 'critical', destination: order.destination });
      } else if (order.status === 'READY') {
        result.push({ id: `ready-${order.id}`, icon: '✓', title: `Pedido #${getDisplayOrderCode(order)} pronto`, detail: `${order.table_number ? `Mesa ${order.table_number}` : 'Retirada'} · aguarda entrega há ${minutes} min`, tone: minutes >= 8 ? 'critical' : 'warning', destination: canAccessSalon ? 'SALON' : order.destination });
      }
    });
    if (canAccessSalon) {
      salonData.requests.forEach((request) => result.push({ id: `request-${request.id}`, icon: '+', title: 'Cliente aguardando atendimento', detail: `${request.userPhone || 'Cliente'} · ${request.paxCount || request.pax_count || '?'} pessoa(s) · ${elapsedMinutes(request.createdAt || request.created_at)} min`, tone: 'warning', destination: 'SALON' }));
      salonData.closeRequests.forEach((request) => result.push({ id: `close-${request.id}`, icon: '$', title: 'Conta aguardando fechamento', detail: `${request.tableNumber ? `Mesa ${request.tableNumber}` : request.userPhone || 'Comanda'} · R$ ${Number(request.amountDue || 0).toFixed(2).replace('.', ',')}`, tone: 'info', destination: 'SALON' }));
    }
    const weight = { critical: 0, warning: 1, info: 2 };
    return result.sort((left, right) => weight[left.tone] - weight[right.tone]).slice(0, 5);
  }, [canAccessSalon, salonData.closeRequests, salonData.requests, scopedOrders]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = String(session.user.name || 'Equipe').trim().split(/\s+/)[0];
  const rawDateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const dateLabel = rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);
  const connectionLabel = connection === 'online' ? 'Operação conectada' : connection === 'demo' ? 'Modo demonstração' : 'Reconectando operação';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <Text numberOfLines={1} style={styles.tenant}>{session.user.tenant_name || 'Click Garçom'}</Text>
          <Text style={styles.pageTitle}>Visão geral</Text>
        </View>
        <Pressable accessibilityLabel="Atualizar visão geral" onPress={() => { void onRefresh(); }} style={styles.refreshButton}>
          {refreshing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.refreshIcon}>↻</Text>}
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, tablet && styles.heroTablet]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroGreeting}>{greeting}, {firstName}</Text>
            <Text style={styles.heroMessage}>{operationalAlerts > 0 ? `${operationalAlerts} ${operationalAlerts === 1 ? 'ação pede' : 'ações pedem'} sua atenção agora.` : 'Tudo sob controle por aqui.'}</Text>
            <Text style={styles.heroDate}>{dateLabel}</Text>
          </View>
          <View style={[styles.connectionBadge, connection !== 'online' && connection !== 'demo' && styles.connectionBadgeOffline]}>
            <View style={[styles.connectionDot, connection !== 'online' && connection !== 'demo' && styles.connectionDotOffline]} />
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionEyebrow}>AGORA</Text><Text style={styles.sectionTitle}>Resumo da operação</Text></View>
        </View>
        <View style={styles.metricsGrid}>
          <MetricCard value={newOrders.length} label="Novos pedidos" tone="yellow" />
          <MetricCard value={preparingOrders.length} label="Em preparo" tone="blue" />
          <MetricCard value={readyOrders.length} label="Prontos" tone="green" />
          {canAccessSalon ? <MetricCard value={availableTables} label="Mesas livres" tone="purple" /> : null}
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionEyebrow}>PRIORIDADES</Text><Text style={styles.sectionTitle}>Atenção necessária</Text></View>
          {priorities.length ? <View style={styles.countBadge}><Text style={styles.countText}>{priorities.length}</Text></View> : null}
        </View>
        <View style={styles.priorities}>
          {priorities.length ? priorities.map((priority) => (
            <Pressable key={priority.id} onPress={() => onNavigate(priority.destination)} style={styles.priorityCard}>
              <View style={[styles.priorityIcon, priority.tone === 'critical' && styles.priorityIconCritical, priority.tone === 'warning' && styles.priorityIconWarning]}><Text style={styles.priorityIconText}>{priority.icon}</Text></View>
              <View style={styles.priorityCopy}><Text style={styles.priorityTitle}>{priority.title}</Text><Text style={styles.priorityDetail}>{priority.detail}</Text></View>
              <Text style={styles.priorityArrow}>›</Text>
            </Pressable>
          )) : <View style={styles.calmCard}><View style={styles.calmIcon}><Text style={styles.calmIconText}>✓</Text></View><View><Text style={styles.calmTitle}>Operação em dia</Text><Text style={styles.calmDetail}>Nenhuma prioridade crítica neste momento.</Text></View></View>}
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionEyebrow}>ATALHOS</Text><Text style={styles.sectionTitle}>Ir direto para</Text></View>
        </View>
        <View style={styles.quickGrid}>
          {allowedStations.includes('KITCHEN') ? <QuickAction icon="◉" title="Cozinha" detail={`${orders.filter((order) => order.destination === 'KITCHEN' && order.status !== 'DELIVERED').length} pedido(s) ativo(s)`} onPress={() => onNavigate('KITCHEN')} /> : null}
          {allowedStations.includes('BAR') ? <QuickAction icon="◆" title="Bar" detail={`${orders.filter((order) => order.destination === 'BAR' && order.status !== 'DELIVERED').length} pedido(s) ativo(s)`} onPress={() => onNavigate('BAR')} /> : null}
          {canAccessSalon ? <QuickAction icon="▦" title="Salão" detail={`${salonData.tabs.length} comanda(s) aberta(s)`} onPress={() => onNavigate('SALON')} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function MetricCard({ value, label, tone }: { value: number; label: string; tone: 'yellow' | 'blue' | 'green' | 'purple' }) {
  const toneStyle = tone === 'yellow' ? styles.metricYellow : tone === 'blue' ? styles.metricBlue : tone === 'green' ? styles.metricGreen : styles.metricPurple;
  return <View style={styles.metricCard}><View style={[styles.metricMark, toneStyle]} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function QuickAction({ icon, title, detail, onPress }: { icon: string; title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.quickCard}><View style={styles.quickIcon}><Text style={styles.quickIconText}>{icon}</Text></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickDetail}>{detail}</Text></View><Text style={styles.quickArrow}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6f8' }, header: { minHeight: 82, backgroundColor: '#2f343c', paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerIdentity: { flex: 1 }, tenant: { color: '#b8bec8', fontSize: 10, fontWeight: '800', letterSpacing: .8, textTransform: 'uppercase' }, pageTitle: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 3 }, refreshButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#464c56', alignItems: 'center', justifyContent: 'center' }, refreshIcon: { color: '#fff', fontSize: 23 }, scroll: { flex: 1 }, content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 14, paddingBottom: 26, gap: 17 }, hero: { backgroundColor: '#4f70f5', borderRadius: 20, padding: 19, gap: 17, overflow: 'hidden' }, heroTablet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heroCopy: { flex: 1 }, heroGreeting: { color: '#fff', fontSize: 23, fontWeight: '900' }, heroMessage: { color: '#eef1ff', fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 6 }, heroDate: { color: '#cfd7ff', fontSize: 12, fontWeight: '700', marginTop: 13 }, connectionBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(18,73,39,.55)', paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12 }, connectionBadgeOffline: { backgroundColor: 'rgba(105,48,44,.7)' }, connectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6cec8c' }, connectionDotOffline: { backgroundColor: '#ffaaa3' }, connectionText: { color: '#fff', fontSize: 11, fontWeight: '900' }, sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }, sectionEyebrow: { color: '#6579d8', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, sectionTitle: { color: '#2a2f36', fontSize: 19, fontWeight: '900', marginTop: 3 }, metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, metricCard: { width: '47%', minWidth: 135, flexGrow: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e8ec', borderRadius: 15, padding: 14, overflow: 'hidden' }, metricMark: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 }, metricYellow: { backgroundColor: '#efa83e' }, metricBlue: { backgroundColor: '#5374ed' }, metricGreen: { backgroundColor: '#42a860' }, metricPurple: { backgroundColor: '#8a68d7' }, metricValue: { color: '#292e35', fontSize: 24, fontWeight: '900' }, metricLabel: { color: '#717781', fontSize: 11, fontWeight: '800', marginTop: 3 }, countBadge: { minWidth: 27, height: 27, borderRadius: 14, backgroundColor: '#fee8e6', alignItems: 'center', justifyContent: 'center' }, countText: { color: '#c84b44', fontSize: 12, fontWeight: '900' }, priorities: { gap: 9 }, priorityCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e8ec', borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, priorityIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#eaf0ff', alignItems: 'center', justifyContent: 'center' }, priorityIconCritical: { backgroundColor: '#fee9e7' }, priorityIconWarning: { backgroundColor: '#fff2d8' }, priorityIconText: { color: '#34445e', fontSize: 17, fontWeight: '900' }, priorityCopy: { flex: 1 }, priorityTitle: { color: '#2e333a', fontSize: 14, fontWeight: '900' }, priorityDetail: { color: '#747b84', fontSize: 11, lineHeight: 16, marginTop: 3 }, priorityArrow: { color: '#5270e9', fontSize: 25, fontWeight: '700' }, calmCard: { backgroundColor: '#edf8f0', borderRadius: 15, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, calmIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#d9f2df', alignItems: 'center', justifyContent: 'center' }, calmIconText: { color: '#3da45a', fontSize: 21, fontWeight: '900' }, calmTitle: { color: '#2f6f41', fontSize: 14, fontWeight: '900' }, calmDetail: { color: '#5f856a', fontSize: 11, marginTop: 3 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, quickCard: { width: '47%', minWidth: 155, flexGrow: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e8ec', borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, quickIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#e9edff', alignItems: 'center', justifyContent: 'center' }, quickIconText: { color: '#506ce3', fontSize: 17, fontWeight: '900' }, quickCopy: { flex: 1 }, quickTitle: { color: '#2f343b', fontSize: 14, fontWeight: '900' }, quickDetail: { color: '#7a8088', fontSize: 10, marginTop: 3 }, quickArrow: { color: '#7a8290', fontSize: 22 },
});

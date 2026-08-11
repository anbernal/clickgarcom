import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEMO_ORDERS, DEMO_SESSION, DEMO_SLA } from './src/data/demo';
import { DEFAULT_ADMIN_API_BASE_URL, DEFAULT_KDS_WS_URL } from './src/config';
import { getMenu, getOrders, getSalonData, login, updateOrderStatus } from './src/services/api';
import { clearStoredSession, loadStoredSession, storeSession } from './src/services/storage';
import { SalonScreen } from './src/components/SalonScreen';
import { HomeScreen } from './src/components/HomeScreen';
import { DEMO_CHATS, DEMO_CLOSE_REQUESTS, DEMO_REQUESTS, DEMO_TABLES, DEMO_TABS } from './src/data/demo-salon';
import {
  ApiError,
  KdsEvent,
  KdsMenuItem,
  KdsOrder,
  KdsSession,
  KdsStation,
  OrderStatus,
  CloseBillRequest,
  SalonRequest,
  SalonTab,
  SalonTable,
  StationConnection,
  WaiterChat,
} from './src/types';
import {
  getDisplayOrderCode,
  getElapsed,
  getItemName,
  getOrderStageStart,
  getStationForRole,
  normalizeOrder,
  normalizeRole,
} from './src/utils/kds';

type Screen = 'login' | 'home' | 'board' | 'salon' | 'settings';
type BoardTab = 'PENDING' | 'ACCEPTED' | 'READY';

const BOARD_TABS: Array<{ key: BoardTab; label: string }> = [
  { key: 'PENDING', label: 'Novos' },
  { key: 'ACCEPTED', label: 'Em preparo' },
  { key: 'READY', label: 'Prontos' },
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Novo pedido',
  ACCEPTED: 'Em preparo',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};

const canUseSalon = (currentSession: KdsSession | null) => ['ADMIN', 'MANAGER', 'WAITER'].includes(normalizeRole(currentSession?.user.role));

export default function App() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [screen, setScreen] = useState<Screen>('login');
  const [session, setSession] = useState<KdsSession | null>(null);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [menuItems, setMenuItems] = useState<KdsMenuItem[]>([]);
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  const [salonData, setSalonData] = useState<{ tables: SalonTable[]; tabs: SalonTab[]; requests: SalonRequest[]; closeRequests: CloseBillRequest[]; chats: WaiterChat[] }>({ tables: [], tabs: [], requests: [], closeRequests: [], chats: [] });
  const [connection, setConnection] = useState<StationConnection>('offline');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeStation, setActiveStation] = useState<KdsStation>('KITCHEN');
  const [activeTab, setActiveTab] = useState<BoardTab>('PENDING');
  const [selectedOrder, setSelectedOrder] = useState<KdsOrder | null>(null);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [, setClockTick] = useState(0);

  const sessionRef = useRef<KdsSession | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    loadStoredSession()
      .then((stored) => {
        if (stored) {
          setSession(stored);
          setActiveStation(getStationForRole(stored.user.role));
          setScreen('home');
        }
      })
      .catch(() => setNotice('Não foi possível recuperar a sessão salva.'))
      .finally(() => setIsLoading(false));

    return () => {
      socketRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setClockTick((current) => current + 1), 1_000);
    return () => clearInterval(clock);
  }, []);

  const applyKdsEvent = useCallback((event: KdsEvent) => {
    if (!event?.type || event.type === 'connected' || !event.data) return;
    const incoming = normalizeOrder(event.data);

    setOrders((current) => {
      const index = current.findIndex((order) => order.id === incoming.id);
      if (incoming.status === 'DELIVERED' || incoming.status === 'CANCELED') {
        return current.filter((order) => order.id !== incoming.id);
      }
      if (index < 0) return [incoming, ...current];
      return current.map((order) => (order.id === incoming.id ? incoming : order));
    });

    if (event.type === 'order.created' && soundEnabled) {
      setNotice('Novo pedido recebido.');
    }
  }, [soundEnabled]);

  const refreshOrders = useCallback(async (currentSession = sessionRef.current) => {
    if (!currentSession) return;

    if (currentSession.mode === 'demo') {
      setOrders((current) => current.length > 0 ? current : DEMO_ORDERS);
      setMenuItems([]);
      setItemNames({});
      return;
    }

    setIsRefreshing(true);
    try {
      const [ordersData, menuData] = await Promise.all([
        getOrders(currentSession),
        getMenu(currentSession),
      ]);
      setOrders(ordersData.map(normalizeOrder));
      setMenuItems(menuData);
      setItemNames(Object.fromEntries(menuData.map((item) => [item.id, item.name])));
      setConnection((current) => (current === 'offline' ? 'reconnecting' : current));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Não foi possível atualizar os pedidos.';
      setNotice(message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const refreshSalon = useCallback(async (currentSession = sessionRef.current) => {
    if (!currentSession || !canUseSalon(currentSession)) return;
    if (currentSession.mode === 'demo') {
      setSalonData({ tables: DEMO_TABLES, tabs: DEMO_TABS, requests: DEMO_REQUESTS, closeRequests: DEMO_CLOSE_REQUESTS, chats: DEMO_CHATS });
      return;
    }
    setIsRefreshing(true);
    try {
      setSalonData(await getSalonData(currentSession));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Não foi possível atualizar o Salão.';
      setNotice(message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let disposed = false;

    const connect = () => {
      const currentSession = sessionRef.current;
      if (disposed || !currentSession || currentSession.mode === 'demo') {
        setConnection(currentSession?.mode === 'demo' ? 'demo' : 'offline');
        return;
      }

      setConnection('reconnecting');
      const url = new URL(currentSession.wsUrl);
      url.searchParams.set('tenant_id', currentSession.user.tenant_id);
      url.searchParams.set('token', currentSession.accessToken);

      const socket = new WebSocket(url.toString());
      socketRef.current = socket;
      socket.onopen = () => setConnection('online');
      socket.onmessage = (message) => {
        try {
          applyKdsEvent(JSON.parse(String(message.data)) as KdsEvent);
        } catch {
          // Eventos inválidos não devem interromper a estação.
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (disposed) return;
        setConnection('reconnecting');
        reconnectTimerRef.current = setTimeout(connect, 3_000);
      };
    };

    refreshOrders(session);
    refreshSalon(session);
    connect();
    const poll = setInterval(() => {
      refreshOrders(sessionRef.current);
      refreshSalon(sessionRef.current);
    }, 15_000);

    return () => {
      disposed = true;
      clearInterval(poll);
      socketRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [applyKdsEvent, refreshOrders, refreshSalon, session]);

  const handleLogin = async (input: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      const nextSession = await login({
        ...input,
        apiBaseUrl: DEFAULT_ADMIN_API_BASE_URL,
        wsUrl: DEFAULT_KDS_WS_URL,
      });
      setSession(nextSession);
      setActiveStation(getStationForRole(nextSession.user.role));
      setScreen('home');
      setNotice(null);
      await storeSession(nextSession).catch(() => {
        setNotice('A sessão ficará ativa enquanto esta aba estiver aberta.');
      });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemo = async () => {
    setSession(DEMO_SESSION);
    setOrders(DEMO_ORDERS);
    setSalonData({ tables: DEMO_TABLES, tabs: DEMO_TABS, requests: DEMO_REQUESTS, closeRequests: DEMO_CLOSE_REQUESTS, chats: DEMO_CHATS });
    setActiveStation('KITCHEN');
    setScreen('home');
    setConnection('demo');
    await storeSession(DEMO_SESSION).catch(() => undefined);
  };

  const handleLogout = async () => {
    socketRef.current?.close();
    await clearStoredSession();
    setSession(null);
    setOrders([]);
    setMenuItems([]);
    setItemNames({});
    setSalonData({ tables: [], tabs: [], requests: [], closeRequests: [], chats: [] });
    setConnection('offline');
    setScreen('login');
  };

  const handleTransition = async (order: KdsOrder, status: OrderStatus, prepMinutes?: number) => {
    if (!session) return;
    setProcessingOrderId(order.id);
    try {
      let saved: KdsOrder;
      if (session.mode === 'demo') {
        const now = new Date().toISOString();
        saved = {
          ...order,
          status,
          accepted_at: status === 'ACCEPTED' ? now : order.accepted_at,
          ready_at: status === 'READY' ? now : order.ready_at,
          delivered_at: status === 'DELIVERED' ? now : order.delivered_at,
        };
      } else {
        saved = normalizeOrder(await updateOrderStatus(session, order.id, status, prepMinutes));
      }

      setOrders((current) => (
        status === 'DELIVERED' || status === 'CANCELED'
          ? current.filter((candidate) => candidate.id !== saved.id)
          : current.map((candidate) => (candidate.id === saved.id ? saved : candidate))
      ));
      setSelectedOrder(null);
      setNotice(`Pedido ${STATUS_LABEL[status].toLowerCase()}.`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Não foi possível atualizar o pedido.';
      setNotice(message);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const role = normalizeRole(session?.user.role);
  const allowedStations: KdsStation[] = role === 'BAR'
    ? ['BAR']
    : role === 'KITCHEN'
      ? ['KITCHEN']
      : ['KITCHEN', 'BAR'];
  const canCancel = ['ADMIN', 'MANAGER', 'WAITER'].includes(role);
  const canAccessSalon = canUseSalon(session);

  const stationOrders = useMemo(
    () => orders
      .filter((order) => order.destination === activeStation)
      .sort((a, b) => new Date(getOrderStageStart(a)).getTime() - new Date(getOrderStageStart(b)).getTime()),
    [activeStation, orders],
  );

  const visibleOrders = stationOrders.filter((order) => order.status === activeTab);
  const summary = {
    PENDING: stationOrders.filter((order) => order.status === 'PENDING').length,
    ACCEPTED: stationOrders.filter((order) => order.status === 'ACCEPTED').length,
    READY: stationOrders.filter((order) => order.status === 'READY').length,
  };

  if (isLoading && !session) {
    return <LoadingScreen />;
  }

  if (!session || screen === 'login') {
    return <LoginScreen onLogin={handleLogin} onDemo={handleDemo} busy={isLoading} />;
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        session={session}
        soundEnabled={soundEnabled}
        onSoundChange={setSoundEnabled}
        onBack={() => setScreen('home')}
        onLogout={handleLogout}
        activeStation={activeStation}
        allowedStations={allowedStations}
        canAccessSalon={canAccessSalon}
        onStation={(station) => { setActiveStation(station); setScreen('board'); }}
        onSalon={() => setScreen('salon')}
      />
    );
  }

  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.app}>
          <HomeScreen
            session={session}
            connection={connection}
            orders={orders}
            salonData={salonData}
            allowedStations={allowedStations}
            canAccessSalon={canAccessSalon}
            refreshing={isRefreshing}
            onRefresh={async () => { await Promise.all([refreshOrders(), refreshSalon()]); }}
            onNavigate={(destination) => {
              if (destination === 'SALON') setScreen('salon');
              else { setActiveStation(destination); setScreen('board'); }
            }}
          />
          <BottomNavigation
            active="home"
            activeStation={activeStation}
            allowedStations={allowedStations}
            canAccessSalon={canAccessSalon}
            onHome={() => setScreen('home')}
            onStation={(station) => { setActiveStation(station); setScreen('board'); }}
            onSalon={() => setScreen('salon')}
            onSettings={() => setScreen('settings')}
          />
        </View>
        {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
      </SafeAreaView>
    );
  }

  if (screen === 'salon' && canAccessSalon) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.app}>
          <SalonScreen
            session={session}
            orders={orders}
            menuItems={menuItems}
            data={salonData}
            refreshing={isRefreshing}
            onRefresh={refreshSalon}
            onNotice={setNotice}
          />
          <BottomNavigation
            active="salon"
            activeStation={activeStation}
            allowedStations={allowedStations}
            canAccessSalon={canAccessSalon}
            onHome={() => setScreen('home')}
            onStation={(station) => { setActiveStation(station); setScreen('board'); }}
            onSalon={() => setScreen('salon')}
            onSettings={() => setScreen('settings')}
          />
        </View>
        {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.app}>
        <StationHeader
          session={session}
          activeStation={activeStation}
          connection={connection}
          refreshing={isRefreshing}
          onRefresh={() => refreshOrders()}
        />
        <View style={styles.tabs}>
          {BOARD_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tab,
                activeTab === tab.key && styles.tabActive,
                activeTab === tab.key && tab.key === 'PENDING' && styles.tabPending,
                activeTab === tab.key && tab.key === 'ACCEPTED' && styles.tabAccepted,
                activeTab === tab.key && tab.key === 'READY' && styles.tabReady,
              ]}
            >
              <Text style={[styles.tabValue, activeTab === tab.key && styles.tabValueActive]}>{summary[tab.key]}</Text>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        <FlatList
          key={isTablet ? 'tablet-grid' : 'phone-list'}
          data={visibleOrders}
          numColumns={isTablet ? 2 : 1}
          keyExtractor={(order) => order.id}
          contentContainerStyle={styles.ordersContent}
          columnWrapperStyle={isTablet ? styles.ordersColumns : undefined}
          renderItem={({ item }) => (
            <View style={isTablet ? styles.orderCell : styles.orderCellPhone}>
              <OrderCard
                order={item}
                itemNames={itemNames}
                onPress={() => setSelectedOrder(item)}
              />
            </View>
          )}
          ListEmptyComponent={<EmptyState tab={activeTab} station={activeStation} />}
          refreshing={isRefreshing}
          onRefresh={() => refreshOrders()}
        />
        <BottomNavigation
          active="board"
          activeStation={activeStation}
          allowedStations={allowedStations}
          canAccessSalon={canAccessSalon}
          onHome={() => setScreen('home')}
          onStation={(station) => { setActiveStation(station); setScreen('board'); }}
          onSalon={() => setScreen('salon')}
          onSettings={() => setScreen('settings')}
        />
        {notice ? (
          <Pressable style={styles.notice} onPress={() => setNotice(null)}>
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}
      </View>
      <OrderModal
        order={selectedOrder}
        itemNames={itemNames}
        canCancel={canCancel}
        busy={processingOrderId === selectedOrder?.id}
        onClose={() => setSelectedOrder(null)}
        onTransition={handleTransition}
      />
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color="#fff" size="large" />
      <Text style={styles.loadingText}>Carregando estação…</Text>
    </View>
  );
}

function LoginScreen({
  onLogin,
  onDemo,
  busy,
}: {
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onDemo: () => Promise<void>;
  busy: boolean;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await onLogin({ email, password });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Não foi possível entrar na estação.');
    }
  };

  return (
    <SafeAreaView style={styles.loginSafeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.loginKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.loginLayout, compact && styles.loginLayoutCompact]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.loginBrand, compact && styles.loginBrandCompact]}>
            <Text style={styles.brandEyebrow}>CLICK GARÇOM</Text>
            <Text style={[styles.brandTitle, compact && styles.brandTitleCompact]}>Sua operação,{`\n`}na palma da mão.</Text>
            <Text style={[styles.brandCopy, compact && styles.brandCopyCompact]}>
              Pedidos, salão e atendimento em um só lugar.
            </Text>
            {!compact ? <View style={styles.brandPill}><Text style={styles.brandPillText}>KDS · COZINHA · BAR · SALÃO</Text></View> : null}
          </View>
          <View style={[styles.loginCard, compact && styles.loginCardCompact]}>
            <Text style={styles.loginTitle}>Bem-vindo</Text>
            <Text style={styles.loginSubtitle}>Entre com o mesmo acesso do restaurante.</Text>
            <LabeledInput label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" returnKeyType="next" />
            <LabeledInput label="Senha" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" returnKeyType="done" onSubmitEditing={() => { void submit(); }} />
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <Pressable style={[styles.loginButton, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Entrar no aplicativo</Text>}
            </Pressable>
            <Pressable style={styles.demoButton} onPress={onDemo} disabled={busy}>
              <Text style={styles.demoButtonText}>Explorar demonstração</Text>
            </Pressable>
            <Text style={styles.loginHint}>O restaurante e suas permissões são identificados automaticamente.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor="#9b9d9b" style={styles.fieldInput} {...props} />
    </View>
  );
}

function SettingsScreen({
  session,
  soundEnabled,
  onSoundChange,
  onBack,
  onLogout,
  activeStation,
  allowedStations,
  canAccessSalon,
  onStation,
  onSalon,
}: {
  session: KdsSession;
  soundEnabled: boolean;
  onSoundChange: (value: boolean) => void;
  onBack: () => void;
  onLogout: () => Promise<void>;
  activeStation: KdsStation;
  allowedStations: KdsStation[];
  canAccessSalon: boolean;
  onStation: (station: KdsStation) => void;
  onSalon: () => void;
}) {
  const confirmLogout = () => Alert.alert('Sair da estação?', 'Você precisará entrar novamente para operar os pedidos.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sair', style: 'destructive', onPress: () => { void onLogout(); } },
  ]);

  return (
    <SafeAreaView style={styles.settingsSafeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.settingsHeader}>
          <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backButtonText}>‹</Text></Pressable>
          <View><Text style={styles.settingsEyebrow}>PREFERÊNCIAS</Text><Text style={styles.settingsTitle}>Ajustes</Text></View>
        </View>
        <ScrollView contentContainerStyle={styles.settingsContent}>
          <View style={styles.settingsIdentity}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{session.user.name?.slice(0, 1).toUpperCase() || 'U'}</Text></View>
            <View style={styles.identityCopy}><Text style={styles.settingsIdentityName}>{session.user.name}</Text><Text style={styles.settingsIdentityDetail}>{session.user.tenant_name} · {normalizeRole(session.user.role)}</Text></View>
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}><Text style={styles.settingTitle}>Alerta de novo pedido</Text><Text style={styles.settingDescription}>Mostra um aviso quando um novo pedido chega.</Text></View>
            <Switch value={soundEnabled} onValueChange={onSoundChange} trackColor={{ false: '#d8d9dc', true: '#5275f6' }} />
          </View>
          <Pressable style={styles.logoutButton} onPress={confirmLogout}><Text style={styles.logoutButtonText}>Sair do aplicativo</Text></Pressable>
        </ScrollView>
        <BottomNavigation active="settings" activeStation={activeStation} allowedStations={allowedStations} canAccessSalon={canAccessSalon} onHome={onBack} onStation={onStation} onSalon={onSalon} onSettings={() => undefined} />
      </View>
    </SafeAreaView>
  );
}

function StationHeader({
  session,
  activeStation,
  connection,
  refreshing,
  onRefresh,
}: {
  session: KdsSession;
  activeStation: KdsStation;
  connection: StationConnection;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const connectionLabel = connection === 'online' ? 'Ao vivo' : connection === 'demo' ? 'Demonstração' : 'Reconectando';
  return (
    <View style={styles.header}>
      <View style={styles.headerIdentity}>
        <Text numberOfLines={1} style={styles.headerOverline}>{session.user.tenant_name || 'Click Garçom'} · KDS</Text>
        <Text style={styles.headerTitle}>{activeStation === 'KITCHEN' ? 'Cozinha' : 'Bar'}</Text>
      </View>
      <View style={styles.headerRight}>
        <View style={[styles.connectionPill, connection !== 'online' && connection !== 'demo' && styles.connectionPillOffline]}>
          <View style={[styles.connectionDot, connection !== 'online' && connection !== 'demo' && styles.connectionDotOffline]} />
          <Text style={[styles.connectionText, connection !== 'online' && connection !== 'demo' && styles.connectionTextOffline]}>{connectionLabel}</Text>
        </View>
        <Pressable accessibilityLabel="Atualizar pedidos" onPress={onRefresh} style={styles.iconButton}>
          {refreshing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.iconButtonText}>↻</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function BottomNavigation({ active, activeStation, allowedStations, canAccessSalon, onHome, onStation, onSalon, onSettings }: {
  active: 'home' | 'board' | 'salon' | 'settings';
  activeStation: KdsStation;
  allowedStations: KdsStation[];
  canAccessSalon: boolean;
  onHome: () => void;
  onStation: (station: KdsStation) => void;
  onSalon: () => void;
  onSettings: () => void;
}) {
  return (
    <View style={styles.bottomNav}>
      <NavItem icon="⌂" label="Início" active={active === 'home'} onPress={onHome} />
      {allowedStations.includes('KITCHEN') ? <NavItem icon="◉" label="Cozinha" active={active === 'board' && activeStation === 'KITCHEN'} onPress={() => onStation('KITCHEN')} /> : null}
      {allowedStations.includes('BAR') ? <NavItem icon="◆" label="Bar" active={active === 'board' && activeStation === 'BAR'} onPress={() => onStation('BAR')} /> : null}
      {canAccessSalon ? <NavItem icon="▦" label="Salão" active={active === 'salon'} onPress={onSalon} /> : null}
      <NavItem icon="⚙" label="Ajustes" active={active === 'settings'} onPress={onSettings} />
    </View>
  );
}

function NavItem({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}><Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text></View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function OrderCard({ order, itemNames, onPress }: { order: KdsOrder; itemNames: Record<string, string>; onPress: () => void }) {
  const stageStart = getOrderStageStart(order);
  const elapsed = getElapsed(stageStart, order.status, DEMO_SLA);
  const headerColor = elapsed.severity === 'critical' ? '#ef625d' : elapsed.severity === 'warning' ? '#efa944' : order.status === 'ACCEPTED' ? '#5177f5' : order.status === 'READY' ? '#3bad61' : '#f1b753';
  const visibleItems = order.items.slice(0, 4);
  return (
    <Pressable style={styles.orderCard} onPress={onPress}>
      <View style={[styles.orderHeader, { backgroundColor: headerColor }]}>
        <View>
          <Text style={styles.orderTable}>{order.table_number ? `Mesa ${order.table_number}` : 'Balcão / retirada'}</Text>
          <Text style={styles.orderCode}>Pedido #{getDisplayOrderCode(order)}</Text>
        </View>
        <View style={styles.orderAge}><Text style={styles.orderAgeValue}>{elapsed.text}</Text><Text style={styles.orderAgeLabel}>{STATUS_LABEL[order.status]}</Text></View>
      </View>
      <View style={styles.orderBody}>
        {visibleItems.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemQuantity}>{item.quantity}x</Text>
            <Text numberOfLines={1} style={styles.itemName}>{getItemName(item, itemNames)}</Text>
          </View>
        ))}
        {order.items.length > visibleItems.length ? <Text style={styles.moreItems}>+{order.items.length - visibleItems.length} item(ns)</Text> : null}
        {order.notes ? <Text numberOfLines={2} style={styles.orderNote}>⚠ {order.notes}</Text> : null}
      </View>
      <View style={styles.cardFooter}><Text style={[styles.cardFooterText, elapsed.severity === 'critical' && styles.cardFooterTextCritical]}>{elapsed.label}</Text><Text style={styles.cardFooterAction}>Ver pedido ›</Text></View>
    </Pressable>
  );
}

function EmptyState({ tab, station }: { tab: BoardTab; station: KdsStation }) {
  return <View style={styles.emptyState}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>Sem {tab === 'PENDING' ? 'novos pedidos' : tab === 'ACCEPTED' ? 'pedidos em preparo' : 'pedidos prontos'}</Text><Text style={styles.emptyCopy}>{station === 'KITCHEN' ? 'A cozinha está em dia.' : 'O bar está em dia.'}</Text></View>;
}

function OrderModal({
  order,
  itemNames,
  canCancel,
  busy,
  onClose,
  onTransition,
}: {
  order: KdsOrder | null;
  itemNames: Record<string, string>;
  canCancel: boolean;
  busy: boolean;
  onClose: () => void;
  onTransition: (order: KdsOrder, status: OrderStatus, prepMinutes?: number) => Promise<void>;
}) {
  const [prepMinutes, setPrepMinutes] = useState(15);
  if (!order) return null;

  const action = order.status === 'PENDING'
    ? { label: 'Aceitar e iniciar preparo', status: 'ACCEPTED' as const }
    : order.status === 'ACCEPTED'
      ? { label: 'Marcar como pronto', status: 'READY' as const }
      : { label: 'Confirmar entrega', status: 'DELIVERED' as const };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>{order.destination === 'KITCHEN' ? 'COZINHA' : 'BAR'}</Text><Text style={styles.modalTitle}>Pedido #{getDisplayOrderCode(order)}</Text></View><Pressable style={styles.closeButton} onPress={onClose}><Text style={styles.closeButtonText}>×</Text></Pressable></View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalMeta}><Text style={styles.modalMetaText}>{order.table_number ? `Mesa ${order.table_number}` : 'Balcão / retirada'}</Text><Text style={styles.modalMetaText}>{STATUS_LABEL[order.status]}</Text></View>
            {order.items.map((item) => (
              <View key={item.id} style={styles.modalItem}>
                <Text style={styles.modalItemQuantity}>{item.quantity}x</Text>
                <View style={styles.modalItemContent}><Text style={styles.modalItemName}>{getItemName(item, itemNames)}</Text>{item.selected_options?.map((option, index) => <Text key={`${option.option_name}-${index}`} style={styles.modalItemOption}>{option.group_name}: {option.option_name}</Text>)}{item.observations ? <Text style={styles.modalItemNote}>⚠ {item.observations}</Text> : null}</View>
              </View>
            ))}
            {order.notes ? <View style={styles.generalNote}><Text style={styles.generalNoteLabel}>OBSERVAÇÃO DO PEDIDO</Text><Text style={styles.generalNoteText}>{order.notes}</Text></View> : null}
            {order.status === 'PENDING' ? <View style={styles.prepSelector}><Text style={styles.prepTitle}>Previsão de preparo</Text><View style={styles.prepOptions}>{[10, 15, 20, 30].map((minutes) => <Pressable key={minutes} onPress={() => setPrepMinutes(minutes)} style={[styles.prepOption, prepMinutes === minutes && styles.prepOptionActive]}><Text style={[styles.prepOptionText, prepMinutes === minutes && styles.prepOptionTextActive]}>{minutes} min</Text></Pressable>)}</View></View> : null}
          </ScrollView>
          <View style={styles.modalActions}>
            {canCancel && order.status === 'PENDING' ? <Pressable style={styles.cancelButton} disabled={busy} onPress={() => { void onTransition(order, 'CANCELED'); }}><Text style={styles.cancelButtonText}>Recusar</Text></Pressable> : null}
            <Pressable style={[styles.primaryAction, busy && styles.buttonDisabled]} disabled={busy} onPress={() => { void onTransition(order, action.status, action.status === 'ACCEPTED' ? prepMinutes : undefined); }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryActionText}>{action.label}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f6f8' }, app: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22262b', gap: 14 }, loadingText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loginSafeArea: { flex: 1, backgroundColor: '#20242b' }, loginKeyboard: { flex: 1 }, loginLayout: { flexGrow: 1, flexDirection: 'row', padding: 42, gap: 44, alignItems: 'center', justifyContent: 'center' }, loginLayoutCompact: { flexDirection: 'column', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 18, alignItems: 'stretch', justifyContent: 'flex-start' },
  loginBrand: { width: '42%', maxWidth: 470 }, loginBrandCompact: { width: '100%', maxWidth: undefined }, brandEyebrow: { color: '#9daeff', fontSize: 11, fontWeight: '900', letterSpacing: 2.2 }, brandTitle: { color: '#fff', fontSize: 42, fontWeight: '900', lineHeight: 48, marginTop: 16 }, brandTitleCompact: { fontSize: 31, lineHeight: 36, marginTop: 9 }, brandCopy: { color: '#bec4ce', fontSize: 17, lineHeight: 25, marginTop: 18, maxWidth: 380 }, brandCopyCompact: { fontSize: 14, lineHeight: 20, marginTop: 10 }, brandPill: { alignSelf: 'flex-start', backgroundColor: '#303640', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, marginTop: 26 }, brandPillText: { color: '#e6e8eb', fontWeight: '800', fontSize: 12 },
  loginCard: { width: '48%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 24, padding: 28, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, elevation: 10 }, loginCardCompact: { width: '100%', maxWidth: undefined, padding: 20, borderRadius: 20 }, loginTitle: { fontSize: 25, color: '#20242a', fontWeight: '900' }, loginSubtitle: { fontSize: 14, color: '#747a83', marginTop: 5, marginBottom: 19 },
  field: { gap: 7, marginBottom: 13 }, fieldLabel: { fontSize: 12, fontWeight: '800', color: '#4e5560' }, fieldInput: { backgroundColor: '#f4f5f7', borderWidth: 1, borderColor: '#dfe2e7', height: 52, borderRadius: 12, paddingHorizontal: 14, color: '#24282e', fontSize: 16 }, formError: { color: '#c93631', fontSize: 12, fontWeight: '600', marginBottom: 10 }, loginButton: { backgroundColor: '#4f70f5', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, loginButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' }, demoButton: { alignItems: 'center', paddingVertical: 13 }, demoButtonText: { color: '#4e6de6', fontWeight: '900', fontSize: 13 }, loginHint: { fontSize: 11, color: '#8b9098', lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
  header: { minHeight: 92, backgroundColor: '#2f343c', paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, headerIdentity: { flex: 1 }, headerOverline: { color: '#b8bec8', fontSize: 10, fontWeight: '800', letterSpacing: .8 }, headerTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 3 }, headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#464c56' }, iconButtonText: { color: '#fff', fontSize: 23, fontWeight: '500' }, connectionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#244e34', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 }, connectionPillOffline: { backgroundColor: '#633f3e' }, connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#64df83' }, connectionDotOffline: { backgroundColor: '#ff8f86' }, connectionText: { color: '#c9f5d3', fontSize: 11, fontWeight: '800' }, connectionTextOffline: { color: '#ffd1ce' },
  tabs: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#f5f6f8' }, tab: { flex: 1, minHeight: 70, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#e5e8ec', justifyContent: 'center' }, tabActive: { borderWidth: 2 }, tabPending: { backgroundColor: '#fff8ec', borderColor: '#e9a33b' }, tabAccepted: { backgroundColor: '#eef2ff', borderColor: '#5977ef' }, tabReady: { backgroundColor: '#ecf8ef', borderColor: '#40a85d' }, tabValue: { color: '#31363d', fontSize: 22, lineHeight: 24, fontWeight: '900' }, tabValueActive: { color: '#20252c' }, tabText: { color: '#747b84', fontSize: 11, fontWeight: '800', marginTop: 3 }, tabTextActive: { color: '#3f454d' },
  ordersContent: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 26, gap: 12, flexGrow: 1 }, ordersColumns: { gap: 12 }, orderCell: { flex: 1 }, orderCellPhone: { width: '100%' }, orderCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e6e9ed', shadowColor: '#53606d', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }, orderHeader: { paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, orderTable: { color: '#fff', fontSize: 17, fontWeight: '900' }, orderCode: { color: 'rgba(255,255,255,.9)', fontSize: 12, fontWeight: '700', marginTop: 2 }, orderAge: { alignItems: 'flex-end' }, orderAgeValue: { color: '#fff', fontWeight: '900', fontSize: 17 }, orderAgeLabel: { color: 'rgba(255,255,255,.93)', fontSize: 10, marginTop: 2 }, orderBody: { padding: 15, gap: 9 }, itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' }, itemQuantity: { color: '#5275f6', fontSize: 17, fontWeight: '900', minWidth: 34 }, itemName: { flex: 1, color: '#30343a', fontSize: 16, fontWeight: '700' }, moreItems: { color: '#747a82', fontSize: 12, marginTop: 1 }, orderNote: { backgroundColor: '#fff4d8', color: '#7d5a1b', fontSize: 12, lineHeight: 17, padding: 9, borderRadius: 8, marginTop: 3, fontWeight: '600' }, cardFooter: { borderTopWidth: 1, borderTopColor: '#eceef0', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between' }, cardFooterText: { color: '#767c84', fontSize: 12, fontWeight: '700' }, cardFooterTextCritical: { color: '#d44540' }, cardFooterAction: { color: '#4e72f4', fontSize: 12, fontWeight: '900' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 55 }, emptyIcon: { width: 54, height: 54, borderRadius: 27, textAlign: 'center', lineHeight: 54, backgroundColor: '#e2f7e7', color: '#38ad5b', fontSize: 27, fontWeight: '900' }, emptyTitle: { marginTop: 14, color: '#30343a', fontSize: 17, fontWeight: '900' }, emptyCopy: { marginTop: 5, color: '#858a92', fontSize: 13 },
  bottomNav: { minHeight: 70, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e1e4e8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 5 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, navIconWrap: { minWidth: 40, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, navIconWrapActive: { backgroundColor: '#e9edff' }, navIcon: { color: '#747b85', fontSize: 17, fontWeight: '900' }, navIconActive: { color: '#4969e8' }, navLabel: { color: '#777e87', fontSize: 10, fontWeight: '800' }, navLabelActive: { color: '#3f5fd8' },
  notice: { position: 'absolute', bottom: 82, alignSelf: 'center', maxWidth: '90%', backgroundColor: '#2d3137', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 14, shadowColor: '#000', shadowOpacity: .2, shadowRadius: 10, elevation: 6 }, noticeText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  settingsSafeArea: { flex: 1, backgroundColor: '#f5f6f8' }, settingsHeader: { backgroundColor: '#fff', paddingHorizontal: 16, minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7ea' }, backButton: { width: 40, height: 40, backgroundColor: '#eef0f3', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, backButtonText: { color: '#434850', fontWeight: '900', fontSize: 24, lineHeight: 26 }, settingsEyebrow: { color: '#818791', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, settingsTitle: { fontSize: 23, color: '#292d33', fontWeight: '900', marginTop: 2 }, settingsContent: { padding: 16, maxWidth: 750, width: '100%', alignSelf: 'center', gap: 12, flexGrow: 1 }, settingsIdentity: { backgroundColor: '#30353d', padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#526fe8', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' }, identityCopy: { flex: 1 }, settingsIdentityName: { color: '#fff', fontWeight: '900', fontSize: 18 }, settingsIdentityDetail: { color: '#c8cbd0', marginTop: 4, fontSize: 12 }, settingRow: { backgroundColor: '#fff', padding: 16, borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: '#e5e8ec' }, settingCopy: { flex: 1 }, settingTitle: { color: '#2d3137', fontSize: 15, fontWeight: '900' }, settingDescription: { color: '#7b818a', fontSize: 12, lineHeight: 17, marginTop: 4 }, logoutButton: { borderWidth: 1, borderColor: '#e77b76', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 }, logoutButtonText: { color: '#c23e39', fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(19,22,26,.45)', justifyContent: 'flex-end' }, modalCard: { maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }, modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e8eaed' }, modalEyebrow: { color: '#6279df', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, modalTitle: { color: '#292d33', fontWeight: '900', fontSize: 25, marginTop: 3 }, closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef0f2', alignItems: 'center', justifyContent: 'center' }, closeButtonText: { fontSize: 27, color: '#596069', lineHeight: 30 }, modalScroll: { maxHeight: 360 }, modalContent: { padding: 20, gap: 14 }, modalMeta: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f3f5f7', padding: 11, borderRadius: 9 }, modalMetaText: { color: '#555c65', fontWeight: '800', fontSize: 13 }, modalItem: { flexDirection: 'row', gap: 14, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: '#edf0f2' }, modalItemQuantity: { color: '#5275f6', fontWeight: '900', fontSize: 19, minWidth: 38 }, modalItemContent: { flex: 1, gap: 3 }, modalItemName: { color: '#2e3238', fontWeight: '800', fontSize: 17 }, modalItemOption: { color: '#6e747d', fontSize: 13 }, modalItemNote: { color: '#93671f', fontSize: 13, backgroundColor: '#fff4d8', padding: 7, borderRadius: 6, marginTop: 4 }, generalNote: { backgroundColor: '#fff4d8', padding: 12, borderRadius: 9 }, generalNoteLabel: { color: '#88601e', fontWeight: '900', fontSize: 10, letterSpacing: .8 }, generalNoteText: { color: '#704e19', fontSize: 14, fontWeight: '600', marginTop: 5 }, prepSelector: { marginTop: 2 }, prepTitle: { color: '#33373d', fontWeight: '800', fontSize: 14, marginBottom: 9 }, prepOptions: { flexDirection: 'row', gap: 8 }, prepOption: { borderWidth: 1, borderColor: '#dfe3e7', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 }, prepOptionActive: { backgroundColor: '#4e72f4', borderColor: '#4e72f4' }, prepOptionText: { color: '#656b74', fontWeight: '800', fontSize: 13 }, prepOptionTextActive: { color: '#fff' }, modalActions: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#e8eaed' }, cancelButton: { borderWidth: 1, borderColor: '#e0706b', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' }, cancelButtonText: { color: '#c5413c', fontWeight: '800' }, primaryAction: { flex: 1, backgroundColor: '#4e72f4', minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '900' }, buttonDisabled: { opacity: .55 },
});

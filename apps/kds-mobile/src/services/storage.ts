import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { KdsSession } from '../types';

const SESSION_KEY = 'clickgarcom.kds.session.v1';

export async function loadStoredSession(): Promise<KdsSession | null> {
  const value = Platform.OS === 'web'
    ? getWebSession()
    : await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as KdsSession;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function storeSession(session: KdsSession) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

function getWebSession() {
  return globalThis.localStorage?.getItem(SESSION_KEY) || null;
}

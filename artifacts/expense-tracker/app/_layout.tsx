import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeDatabase } from '../lib/database';
import AppLock from '../components/AppLock';

const LOCK_ENABLED_KEY = 'app_lock_enabled';
const LOCK_AFTER_MS = 3000;

export default function RootLayout() {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const init = async () => {
      initializeDatabase();
      try {
        const val = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
        const enabled = val === 'true';
        setLockEnabled(enabled);
        if (enabled) setIsLocked(true);
      } catch {}
      setReady(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current === 'active' && nextState === 'background') {
        backgroundedAt.current = Date.now();
      }
      if (
        (nextState === 'active') &&
        (appState.current === 'background' || appState.current === 'inactive')
      ) {
        const elapsed = backgroundedAt.current ? Date.now() - backgroundedAt.current : Infinity;
        if (elapsed > LOCK_AFTER_MS) {
          AsyncStorage.getItem(LOCK_ENABLED_KEY).then(val => {
            if (val === 'true') setIsLocked(true);
          });
        }
        backgroundedAt.current = null;
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [ready]);

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  if (!ready) return null;

  if (isLocked && lockEnabled && Platform.OS !== 'web') {
    return <AppLock onUnlock={handleUnlock} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#6366F1" translucent={false} />
    </>
  );
}

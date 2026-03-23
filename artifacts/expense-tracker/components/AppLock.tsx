import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';

interface Props {
  onUnlock: () => void;
}

type AuthState = 'idle' | 'prompting' | 'failed' | 'unavailable';

const APP_ACCENT = '#6366F1';

export default function AppLock({ onUnlock }: Props) {
  const { colors, dark } = useTheme();
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'face' | 'passcode'>('fingerprint');
  const [errorMsg, setErrorMsg] = useState('');

  const detectBiometricType = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const LocalAuth = await import('expo-local-authentication');
      const types = await LocalAuth.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      } else {
        setBiometricType('passcode');
      }
    } catch {}
  }, []);

  const authenticate = useCallback(async () => {
    if (Platform.OS === 'web') { onUnlock(); return; }
    setAuthState('prompting');
    setErrorMsg('');
    try {
      const LocalAuth = await import('expo-local-authentication');
      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setAuthState('unavailable');
        setErrorMsg('No biometrics or device lock set up on this phone.');
        return;
      }

      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Unlock Expense Tracker',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        onUnlock();
      } else {
        setAuthState('failed');
        const errType = (result as any).error;
        if (errType === 'user_cancel' || errType === 'system_cancel') {
          setErrorMsg('Authentication cancelled. Tap to try again.');
        } else if (errType === 'lockout' || errType === 'lockout_permanent') {
          setErrorMsg('Too many failed attempts. Use your device passcode.');
        } else {
          setErrorMsg('Authentication failed. Tap to try again.');
        }
      }
    } catch (e: any) {
      setAuthState('failed');
      setErrorMsg('Could not authenticate. Please try again.');
    }
  }, [onUnlock]);

  useEffect(() => {
    detectBiometricType();
    const timer = setTimeout(() => authenticate(), 200);
    return () => clearTimeout(timer);
  }, []);

  const biometricIcon = biometricType === 'face' ? 'aperture' : biometricType === 'fingerprint' ? 'activity' : 'smartphone';
  const biometricLabel =
    biometricType === 'face' ? 'Use Face ID' :
    biometricType === 'fingerprint' ? 'Use Fingerprint' :
    'Use Device PIN';

  return (
    <View style={[styles.container, { backgroundColor: dark ? '#0F0F1A' : '#F0F0FF' }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={dark ? '#0F0F1A' : '#F0F0FF'} />

      <View style={styles.content}>
        <View style={[styles.appIconWrap, { backgroundColor: APP_ACCENT }]}>
          <Feather name="dollar-sign" size={36} color="#FFFFFF" />
        </View>
        <Text style={[styles.appName, { color: dark ? '#FFFFFF' : '#1A1A2E' }]}>Expense Tracker</Text>
        <Text style={[styles.subtitle, { color: dark ? '#9CA3AF' : '#6B7280' }]}>Authenticate to continue</Text>

        <View style={[styles.lockBadge, { backgroundColor: dark ? '#1E1E30' : '#FFFFFF' }]}>
          <Feather name="lock" size={28} color={APP_ACCENT} />
        </View>

        {authState === 'prompting' ? (
          <View style={styles.promptingRow}>
            <ActivityIndicator color={APP_ACCENT} size="small" />
            <Text style={[styles.promptingText, { color: dark ? '#9CA3AF' : '#6B7280' }]}>Waiting for authentication…</Text>
          </View>
        ) : authState === 'unavailable' ? (
          <View style={[styles.errorBox, { backgroundColor: dark ? '#2A1A1A' : '#FEE2E2' }]}>
            <Feather name="alert-circle" size={16} color="#EF4444" />
            <Text style={[styles.errorText, { color: '#EF4444' }]}>{errorMsg}</Text>
          </View>
        ) : (
          <>
            {authState === 'failed' && errorMsg ? (
              <View style={[styles.errorBox, { backgroundColor: dark ? '#1A1A2A' : '#EEF2FF' }]}>
                <Feather name="info" size={14} color={APP_ACCENT} />
                <Text style={[styles.errorText, { color: APP_ACCENT }]}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.unlockBtn, { backgroundColor: APP_ACCENT }]}
              onPress={authenticate}
              activeOpacity={0.85}
            >
              <Feather name={biometricIcon as any} size={20} color="#FFFFFF" />
              <Text style={styles.unlockBtnText}>{biometricLabel}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={[styles.footer, { color: dark ? '#4B5563' : '#9CA3AF' }]}>
        Your data is private and stored locally
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', width: '100%', paddingHorizontal: 40 },
  appIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  appName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 15, marginBottom: 36 },
  lockBadge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 36, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  promptingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  promptingText: { fontSize: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, marginBottom: 20, width: '100%' },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', paddingVertical: 16, borderRadius: 16, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  unlockBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 48, fontSize: 12 },
});

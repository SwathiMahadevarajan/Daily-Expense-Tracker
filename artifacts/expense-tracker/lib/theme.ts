import { useColorScheme } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'theme_preference';
export type ThemeMode = 'light' | 'dark' | 'system';

let themeOverride: ThemeMode = 'system';
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function setThemeMode(mode: ThemeMode) {
  themeOverride = mode;
  AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  notify();
}

export function getThemeMode(): ThemeMode {
  return themeOverride;
}

function loadThemePreference() {
  if (initialized) return;
  initialized = true;
  AsyncStorage.getItem(THEME_KEY).then(val => {
    if (val === 'light' || val === 'dark' || val === 'system') {
      themeOverride = val as ThemeMode;
      notify();
    }
  }).catch(() => {});
}

const LIGHT = {
  bg: '#F9FAFB',
  card: '#FFFFFF',
  cardAlt: '#F3F4F6',
  border: '#E5E7EB',
  divider: '#F3F4F6',
  text: '#111827',
  textSub: '#374151',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  inputBg: '#F3F4F6',
  inputText: '#111827',
  placeholder: '#9CA3AF',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryBg: '#EEF2FF',
  primaryBorder: '#C7D2FE',
  success: '#10B981',
  successBg: '#D1FAE5',
  successText: '#065F46',
  danger: '#EF4444',
  dangerBg: '#FEE2E2',
  dangerText: '#991B1B',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  warningText: '#92400E',
  orange: '#F97316',
  tabBar: '#FFFFFF',
  tabBorder: '#E5E7EB',
  header: '#6366F1',
  overlay: 'rgba(0,0,0,0.4)',
};

const DARK: typeof LIGHT = {
  bg: '#0F172A',
  card: '#1E293B',
  cardAlt: '#334155',
  border: '#334155',
  divider: '#1E293B',
  text: '#F1F5F9',
  textSub: '#CBD5E1',
  textMuted: '#94A3B8',
  textFaint: '#64748B',
  inputBg: '#334155',
  inputText: '#F1F5F9',
  placeholder: '#64748B',
  primary: '#818CF8',
  primaryLight: '#A5B4FC',
  primaryBg: '#1E1B4B',
  primaryBorder: '#4338CA',
  success: '#34D399',
  successBg: '#064E3B',
  successText: '#A7F3D0',
  danger: '#F87171',
  dangerBg: '#450A0A',
  dangerText: '#FCA5A5',
  warning: '#FBBF24',
  warningBg: '#451A03',
  warningText: '#FDE68A',
  orange: '#FB923C',
  tabBar: '#1E293B',
  tabBorder: '#334155',
  header: '#4338CA',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useTheme() {
  const [, rerender] = useState(0);
  const systemScheme = useColorScheme();

  useEffect(() => {
    loadThemePreference();
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const dark = themeOverride === 'system'
    ? systemScheme === 'dark'
    : themeOverride === 'dark';

  return { dark, colors: dark ? DARK : LIGHT, themeMode: themeOverride };
}

export type ThemeColors = typeof LIGHT;

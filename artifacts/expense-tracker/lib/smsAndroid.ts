import { Platform } from 'react-native';

export interface SmsFilter {
  box: 'inbox' | 'sent';
  maxCount: number;
  minDate?: number;
}

export type SmsListCallback = (count: number, smsList: string) => void;
export type SmsErrorCallback = (fail: string) => void;

interface SmsAndroidModule {
  list(filter: string, fail: SmsErrorCallback, success: SmsListCallback): void;
}

let _module: SmsAndroidModule | null = null;
let _attempted = false;

export function getSmsAndroidModule(): SmsAndroidModule | null {
  if (Platform.OS !== 'android') return null;
  if (_attempted) return _module;
  _attempted = true;
  try {
    const mod = require('react-native-get-sms-android');
    _module = (mod?.default ?? mod) as SmsAndroidModule;
    return _module;
  } catch {
    return null;
  }
}

export function isSmsSupported(): boolean {
  return Platform.OS === 'android';
}

export function readSms(filter: SmsFilter): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const mod = getSmsAndroidModule();
    if (!mod) {
      reject(new Error('SMS module not available. Build the APK using EAS Build.'));
      return;
    }
    mod.list(
      JSON.stringify(filter),
      (fail) => reject(new Error(fail ?? 'SMS read failed')),
      (_count, smsList) => {
        try {
          const parsed = JSON.parse(smsList);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          reject(new Error('Failed to parse SMS list'));
        }
      }
    );
  });
}

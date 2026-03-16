import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'payment_sources';

export const DEFAULT_SOURCES = [
  'Google Pay',
  'PhonePe',
  'Paytm',
  'Cash',
  'SBI',
  'HDFC',
  'ICICI',
  'Axis',
];

export async function getPaymentSources(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) return JSON.parse(json);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SOURCES));
    return DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}

export async function savePaymentSources(sources: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

export async function addPaymentSource(source: string): Promise<string[]> {
  const sources = await getPaymentSources();
  if (!sources.includes(source)) {
    const updated = [...sources, source];
    await savePaymentSources(updated);
    return updated;
  }
  return sources;
}

export async function removePaymentSource(source: string): Promise<string[]> {
  const sources = await getPaymentSources();
  const updated = sources.filter(s => s !== source);
  await savePaymentSources(updated);
  return updated;
}

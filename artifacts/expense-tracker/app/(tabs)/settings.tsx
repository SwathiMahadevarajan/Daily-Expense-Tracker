import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  Platform,
  Modal,
  StatusBar,
  Share,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Category, getCategories, addCategory, updateCategory, deleteCategory, createBackup, restoreBackup, BackupData, deleteTransactionsByMonth, deleteAllTransactions, getAvailableMonths } from '../../lib/database';
import { getPaymentSources, addPaymentSource, removePaymentSource } from '../../lib/paymentSources';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CategoryForm from '../../components/CategoryForm';
import { useTheme, setThemeMode, ThemeMode } from '../../lib/theme';

const REMINDER_KEY = 'evening_reminder';
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

const EVENING_HOURS = [
  { label: '6:00 PM', hour: '18', minute: '00' },
  { label: '6:30 PM', hour: '18', minute: '30' },
  { label: '7:00 PM', hour: '19', minute: '00' },
  { label: '7:30 PM', hour: '19', minute: '30' },
  { label: '8:00 PM', hour: '20', minute: '00' },
  { label: '8:30 PM', hour: '20', minute: '30' },
  { label: '9:00 PM', hour: '21', minute: '00' },
  { label: '9:30 PM', hour: '21', minute: '30' },
  { label: '10:00 PM', hour: '22', minute: '00' },
];

function getOpeningBalanceKey(source: string) {
  return `source_ob_${source}`;
}

export default function SettingsScreen() {
  const { colors, dark, themeMode } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState('20');
  const [reminderMinute, setReminderMinute] = useState('00');
  const [newSource, setNewSource] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJson, setRestoreJson] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadData = useCallback(async () => {
    try { setCategories(getCategories()); } catch {}
    try {
      const sources = await getPaymentSources();
      setPaymentSources(sources);
      const bals: Record<string, string> = {};
      for (const s of sources) {
        const val = await AsyncStorage.getItem(getOpeningBalanceKey(s));
        bals[s] = val ?? '';
      }
      setOpeningBalances(bals);
    } catch {}
    try {
      const rem = await AsyncStorage.getItem(REMINDER_KEY);
      if (rem) {
        const { enabled, hour, minute } = JSON.parse(rem);
        setReminderEnabled(enabled ?? false);
        setReminderHour(hour ?? '20');
        setReminderMinute(minute ?? '00');
      }
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const saveReminder = async (enabled: boolean, hour: string, minute: string) => {
    await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled, hour, minute }));
    if (Platform.OS === 'web') return;
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.requestPermissionsAsync();
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (enabled) {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Log your expenses', body: "Time to record today's transactions!", sound: true },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parseInt(hour),
            minute: parseInt(minute),
          },
        });
      }
    } catch {}
  };

  const handleToggleReminder = async (value: boolean) => {
    setReminderEnabled(value);
    await saveReminder(value, reminderHour, reminderMinute);
  };

  const handleSelectTime = async (hour: string, minute: string) => {
    setReminderHour(hour);
    setReminderMinute(minute);
    if (reminderEnabled) await saveReminder(true, hour, minute);
  };

  const selectedTimeLabel = EVENING_HOURS.find(t => t.hour === reminderHour && t.minute === reminderMinute)?.label ?? `${reminderHour}:${reminderMinute}`;

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const backup = createBackup();
      const json = JSON.stringify(backup, null, 2);
      await Share.share({ message: json, title: `ExpenseTracker Backup — ${backup.transactions.length} transactions` });
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message ?? 'Could not create backup.');
    } finally {
      setBackingUp(false);
    }
  };

  const confirmRestore = () => {
    if (!restoreJson.trim()) { Alert.alert('Empty', 'Please paste your backup JSON first.'); return; }
    let data: BackupData;
    try { data = JSON.parse(restoreJson.trim()); } catch {
      Alert.alert('Invalid JSON', 'The pasted text is not valid JSON.');
      return;
    }
    Alert.alert(
      'Restore Backup',
      `This will add ${data.transactions?.length ?? 0} transactions. Existing data will NOT be deleted — duplicates are skipped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = restoreBackup(data);
              setShowRestoreModal(false);
              Alert.alert('Restore Complete', `Added ${result.inserted} new transactions.${result.skipped > 0 ? ` ${result.skipped} skipped.` : ''}`);
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message ?? 'Unknown error');
            } finally {
              setRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleAddCategory = (name: string, icon: string, color: string) => {
    try { addCategory({ name, icon, color, isDefault: false }); } catch {}
    setShowNewCatForm(false);
    setCategories(getCategories());
  };

  const handleEditCategory = (name: string, icon: string, color: string) => {
    if (!editingCat) return;
    try { updateCategory(editingCat.id, { name, icon, color }); } catch {}
    setEditingCat(null);
    setCategories(getCategories());
  };

  const handleDeleteCategory = (cat: Category) => {
    const isBuiltIn = !!cat.isDefault;
    Alert.alert(
      isBuiltIn ? 'Delete Built-in Category?' : 'Delete Category',
      isBuiltIn
        ? `"${cat.name}" is a built-in category. Existing transactions using it will show "Uncategorised". Are you sure?`
        : `Delete "${cat.name}"? Existing transactions using it will show "Uncategorised".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try { deleteCategory(cat.id); } catch {}
            setCategories(getCategories());
          },
        },
      ]
    );
  };

  const handleAddSource = async () => {
    if (!newSource.trim()) return;
    const updated = await addPaymentSource(newSource.trim());
    setPaymentSources(updated);
    setNewSource('');
    const bals = { ...openingBalances };
    bals[newSource.trim()] = '';
    setOpeningBalances(bals);
  };

  const handleRemoveSource = async (source: string) => {
    Alert.alert('Remove Source', `Remove "${source}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const updated = await removePaymentSource(source);
        setPaymentSources(updated);
        await AsyncStorage.removeItem(getOpeningBalanceKey(source));
        const bals = { ...openingBalances };
        delete bals[source];
        setOpeningBalances(bals);
      }},
    ]);
  };

  const handleSaveOpeningBalance = async (source: string) => {
    const val = openingBalances[source] ?? '';
    const num = parseFloat(val);
    if (val !== '' && (isNaN(num) || num < 0)) {
      Alert.alert('Invalid Amount', 'Please enter a valid non-negative amount or leave blank for zero.');
      return;
    }
    await AsyncStorage.setItem(getOpeningBalanceKey(source), val === '' ? '0' : val);
    Alert.alert('Saved', `Opening balance for ${source} set to ₹${val === '' ? '0' : num.toFixed(2)}`);
  };

  const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'Light', icon: 'sun' },
    { mode: 'dark', label: 'Dark', icon: 'moon' },
    { mode: 'system', label: 'System', icon: 'smartphone' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} showsVerticalScrollIndicator={false}>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardLabel, { color: colors.text }]}>Theme</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>Choose how the app looks</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.mode}
                style={[
                  styles.themeBtn,
                  { backgroundColor: colors.cardAlt, borderColor: colors.border },
                  themeMode === opt.mode && { backgroundColor: colors.primaryBg, borderColor: colors.primary },
                ]}
                onPress={() => setThemeMode(opt.mode)}
              >
                <Feather name={opt.icon as any} size={18} color={themeMode === opt.mode ? colors.primary : colors.textMuted} />
                <Text style={[styles.themeBtnText, { color: themeMode === opt.mode ? colors.primary : colors.textSub }]}>
                  {opt.label}
                </Text>
                {themeMode === opt.mode && (
                  <View style={[styles.themeCheck, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={10} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Payment Sources</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {paymentSources.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>No payment sources yet. Add one below.</Text>
          ) : (
            paymentSources.map(source => (
              <View key={source} style={[styles.sourceItem, { borderBottomColor: colors.divider }]}>
                <View style={[styles.sourceIcon, { backgroundColor: colors.primaryBg }]}>
                  <Feather name="credit-card" size={14} color={colors.primary} />
                </View>
                <Text style={[styles.sourceName, { color: colors.text }]}>{source}</Text>
                <TouchableOpacity style={[styles.removeBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleRemoveSource(source)}>
                  <Feather name="trash-2" size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={styles.addSourceRow}>
            <TextInput
              style={[styles.sourceInput, { backgroundColor: colors.inputBg, color: colors.inputText }]}
              value={newSource}
              onChangeText={setNewSource}
              placeholder="Add source (e.g. SBI, Cash, UPI)"
              placeholderTextColor={colors.placeholder}
              onSubmitEditing={handleAddSource}
            />
            <TouchableOpacity style={[styles.addSourceBtn, { backgroundColor: colors.primary }]} onPress={handleAddSource}>
              <Feather name="plus" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {paymentSources.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Opening Balances</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardSub, { color: colors.textMuted }]}>
              Set the balance each account had before you started tracking. Used to calculate current account balances in Analytics.
            </Text>
            {paymentSources.map(source => (
              <View key={source} style={[styles.obRow, { borderBottomColor: colors.divider }]}>
                <View style={[styles.obIcon, { backgroundColor: colors.primaryBg }]}>
                  <Feather name="credit-card" size={14} color={colors.primary} />
                </View>
                <Text style={[styles.obSource, { color: colors.text }]}>{source}</Text>
                <View style={[styles.obInputWrap, { backgroundColor: colors.inputBg }]}>
                  <Text style={[styles.obRupee, { color: colors.textFaint }]}>₹</Text>
                  <TextInput
                    style={[styles.obInput, { color: colors.inputText }]}
                    value={openingBalances[source] ?? ''}
                    onChangeText={val => setOpeningBalances(prev => ({ ...prev, [source]: val }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
                <TouchableOpacity style={[styles.obSaveBtn, { backgroundColor: colors.primaryBg }]} onPress={() => handleSaveOpeningBalance(source)}>
                  <Feather name="check" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Data Backup & Restore</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.backupRow}>
            <View style={[styles.backupIconWrap, { backgroundColor: colors.primaryBg }]}>
              <Feather name="database" size={22} color={colors.primary} />
            </View>
            <View style={styles.backupInfo}>
              <Text style={[styles.backupTitle, { color: colors.text }]}>Backup your data</Text>
              <Text style={[styles.backupSub, { color: colors.textMuted }]}>Export all transactions as JSON. Save to Drive or email to yourself.</Text>
            </View>
          </View>
          <View style={styles.backupBtns}>
            <TouchableOpacity style={[styles.backupBtn, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]} onPress={handleBackup} disabled={backingUp}>
              <Feather name="upload" size={16} color={colors.primary} />
              <Text style={[styles.backupBtnText, { color: colors.primary }]}>{backingUp ? 'Preparing...' : 'Export Backup'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupBtn, { backgroundColor: colors.successBg, borderColor: colors.success }]} onPress={() => { setRestoreJson(''); setShowRestoreModal(true); }}>
              <Feather name="download" size={16} color={colors.success} />
              <Text style={[styles.backupBtnText, { color: colors.success }]}>Restore</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.backupNote, { color: colors.textFaint }]}>To transfer to a new phone: export → save the file → open Expense Tracker on the new phone → paste JSON in Restore.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Evening Reminder</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.reminderToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reminderLabel, { color: colors.text }]}>Daily Expense Reminder</Text>
              <Text style={[styles.reminderSub, { color: colors.textFaint }]}>
                {reminderEnabled ? `Notifying at ${selectedTimeLabel}` : 'Get notified to log expenses every evening'}
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ false: colors.border, true: colors.primaryBorder }}
              thumbColor={reminderEnabled ? colors.primary : colors.textFaint}
            />
          </View>
          {reminderEnabled && (
            <>
              <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.timePickerLabel, { color: colors.textFaint }]}>Choose reminder time</Text>
              <View style={styles.timeChips}>
                {EVENING_HOURS.map(opt => {
                  const sel = reminderHour === opt.hour && reminderMinute === opt.minute;
                  return (
                    <TouchableOpacity
                      key={`${opt.hour}:${opt.minute}`}
                      style={[styles.timeChip, { backgroundColor: sel ? colors.primary : colors.cardAlt }]}
                      onPress={() => handleSelectTime(opt.hour, opt.minute)}
                    >
                      <Text style={[styles.timeChipText, { color: sel ? '#FFFFFF' : colors.textSub }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Categories</Text>
          <TouchableOpacity
            style={[styles.sectionAddBtn, { backgroundColor: colors.primaryBg }]}
            onPress={() => { setShowNewCatForm(!showNewCatForm); setEditingCat(null); }}
          >
            <Feather name={showNewCatForm ? 'x' : 'plus'} size={14} color={colors.primary} />
            <Text style={[styles.sectionAddText, { color: colors.primary }]}>{showNewCatForm ? 'Cancel' : 'Add'}</Text>
          </TouchableOpacity>
        </View>

        {showNewCatForm && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.formHeading, { color: colors.text }]}>New Category</Text>
            <CategoryForm onSave={handleAddCategory} onCancel={() => setShowNewCatForm(false)} saveLabel="Create Category" />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {categories.map(cat => (
            <View key={cat.id}>
              {editingCat?.id === cat.id ? (
                <View style={[styles.catEditBox, { backgroundColor: colors.cardAlt, borderColor: colors.primaryBorder }]}>
                  <CategoryForm
                    initialName={cat.name}
                    initialIcon={cat.icon}
                    initialColor={cat.color}
                    onSave={handleEditCategory}
                    onCancel={() => setEditingCat(null)}
                    saveLabel="Save Changes"
                  />
                </View>
              ) : (
                <View style={[styles.catRow, { borderBottomColor: colors.divider }]}>
                  <View style={[styles.catIcon, { backgroundColor: (cat.color || '#6B7280') + '22' }]}>
                    <Feather name={(cat.icon || 'more-horizontal') as any} size={16} color={cat.color || '#6B7280'} />
                  </View>
                  <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
                  {!!cat.isDefault && (
                    <View style={[styles.builtInBadge, { backgroundColor: colors.cardAlt }]}>
                      <Text style={[styles.builtInBadgeText, { color: colors.textFaint }]}>built-in</Text>
                    </View>
                  )}
                  <View style={styles.catActions}>
                    <TouchableOpacity style={[styles.catActionBtn, { backgroundColor: colors.primaryBg }]} onPress={() => { setEditingCat(cat); setShowNewCatForm(false); }}>
                      <Feather name="edit-2" size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.catActionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDeleteCategory(cat)}>
                      <Feather name="trash-2" size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 60 }} />

      <Modal visible={showRestoreModal} animationType="slide" transparent onRequestClose={() => setShowRestoreModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowRestoreModal(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>Restore from Backup</Text>
            <Text style={[styles.bottomSheetSub, { color: colors.textMuted }]}>Paste your backup JSON below. Existing transactions are kept — duplicates are skipped.</Text>
            <TextInput
              style={[styles.jsonInput, { backgroundColor: colors.inputBg, color: colors.inputText, borderColor: colors.border }]}
              value={restoreJson}
              onChangeText={setRestoreJson}
              placeholder='Paste backup JSON here...'
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.bottomSheetBtns}>
              <TouchableOpacity style={[styles.bottomSheetBtn, { backgroundColor: colors.cardAlt }]} onPress={() => setShowRestoreModal(false)}>
                <Text style={[styles.bottomSheetBtnText, { color: colors.textSub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bottomSheetBtn, { backgroundColor: colors.primary }]} onPress={confirmRestore} disabled={restoring}>
                <Text style={[styles.bottomSheetBtnText, { color: '#FFFFFF' }]}>{restoring ? 'Restoring...' : 'Restore'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, paddingTop: 16, paddingBottom: 8 },
  sectionAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  sectionAddText: { fontSize: 13, fontWeight: '600' },
  card: { marginHorizontal: 12, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  cardSub: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 6, borderWidth: 1.5, position: 'relative' },
  themeBtnText: { fontSize: 13, fontWeight: '600' },
  themeCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sourceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  sourceIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sourceName: { flex: 1, fontSize: 15, fontWeight: '500' },
  removeBtn: { padding: 8, borderRadius: 8 },
  addSourceRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sourceInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addSourceBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  obRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  obIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  obSource: { flex: 1, fontSize: 14, fontWeight: '500' },
  obInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  obRupee: { fontSize: 14, fontWeight: '600' },
  obInput: { fontSize: 14, fontWeight: '600', minWidth: 60, maxWidth: 90 },
  obSaveBtn: { padding: 8, borderRadius: 8 },
  backupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  backupIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backupInfo: { flex: 1 },
  backupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  backupSub: { fontSize: 13, lineHeight: 18 },
  backupBtns: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  backupBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1 },
  backupBtnText: { fontSize: 14, fontWeight: '600' },
  backupNote: { fontSize: 12, lineHeight: 18 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderLabel: { fontSize: 15, fontWeight: '600' },
  reminderSub: { fontSize: 13, marginTop: 2 },
  timeDivider: { height: 1, marginVertical: 14 },
  timePickerLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  timeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  timeChipText: { fontSize: 13, fontWeight: '500' },
  formHeading: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  catEditBox: { borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  catIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catName: { flex: 1, fontSize: 14, fontWeight: '500' },
  builtInBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  builtInBadgeText: { fontSize: 10, fontWeight: '600' },
  catActions: { flexDirection: 'row', gap: 6 },
  catActionBtn: { padding: 7, borderRadius: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  bottomSheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  bottomSheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  bottomSheetSub: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  jsonInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 160, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 16 },
  bottomSheetBtns: { flexDirection: 'row', gap: 10 },
  bottomSheetBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  bottomSheetBtnText: { fontSize: 15, fontWeight: '700' },
});

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
import { Category, getCategories, addCategory, updateCategory, deleteCategory, createBackup, restoreBackup, BackupData } from '../../lib/database';
import { getPaymentSources, addPaymentSource, removePaymentSource } from '../../lib/paymentSources';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CategoryForm from '../../components/CategoryForm';
import { useTheme } from '../../lib/theme';

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

export default function SettingsScreen() {
  const { colors, dark } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
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
    try { setPaymentSources(await getPaymentSources()); } catch {}
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

  const selectedTimeLabel = EVENING_HOURS.find(t => t.hour === reminderHour && t.minute === reminderMinute)?.label
    ?? `${reminderHour}:${reminderMinute}`;

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
  };

  const handleRemoveSource = async (source: string) => {
    Alert.alert('Remove Source', `Remove "${source}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => setPaymentSources(await removePaymentSource(source)) },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} showsVerticalScrollIndicator={false}>

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
                      key={opt.label}
                      style={[styles.timeChip, { backgroundColor: colors.cardAlt, borderColor: 'transparent' }, sel && { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
                      onPress={() => handleSelectTime(opt.hour, opt.minute)}
                    >
                      <Text style={[styles.timeChipText, { color: sel ? colors.primary : colors.textSub }, sel && { fontWeight: '700' }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {Platform.OS === 'web' && (
                <Text style={[styles.notAvailableText, { color: colors.textFaint }]}>Push notifications require the Android APK build.</Text>
              )}
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Payment Sources</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { backgroundColor: colors.inputBg, color: colors.inputText }]}
              value={newSource}
              onChangeText={setNewSource}
              placeholder="e.g. HDFC Card, Paytm..."
              placeholderTextColor={colors.placeholder}
              onSubmitEditing={handleAddSource}
            />
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleAddSource}>
              <Feather name="plus" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.chipWrap}>
            {paymentSources.map(source => (
              <View key={source} style={[styles.sourceChip, { backgroundColor: colors.cardAlt }]}>
                <Text style={[styles.sourceChipText, { color: colors.textSub }]}>{source}</Text>
                <TouchableOpacity onPress={() => handleRemoveSource(source)} style={{ padding: 2 }}>
                  <Feather name="x" size={13} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Categories</Text>
          <TouchableOpacity
            style={[styles.addCatBtn, { backgroundColor: colors.primaryBg }]}
            onPress={() => { setShowNewCatForm(true); setEditingCat(null); }}
          >
            <Feather name="plus" size={14} color={colors.primary} />
            <Text style={[styles.addCatBtnText, { color: colors.primary }]}>New</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.catHint, { color: colors.textFaint }]}>Tap the edit icon to customise any category, including built-in ones.</Text>

        {showNewCatForm && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardSubTitle, { color: colors.textSub }]}>New Category</Text>
            <CategoryForm onSave={handleAddCategory} onCancel={() => setShowNewCatForm(false)} saveLabel="Add Category" />
          </View>
        )}

        {categories.map(cat => {
          const isBuiltIn = !!cat.isDefault;
          return editingCat?.id === cat.id ? (
            <View key={cat.id} style={[styles.card, { backgroundColor: colors.card, marginBottom: 8 }]}>
              <View style={styles.editingCatHeader}>
                <Text style={[styles.cardSubTitle, { color: colors.textSub }]}>Edit: {editingCat.name}</Text>
                {isBuiltIn && (
                  <View style={[styles.defaultBadgeSmall, { backgroundColor: colors.warningBg }]}>
                    <Text style={[styles.defaultBadgeSmallText, { color: colors.warningText }]}>Built-in</Text>
                  </View>
                )}
              </View>
              <CategoryForm
                initialName={cat.name}
                initialIcon={cat.icon}
                initialColor={cat.color}
                onSave={handleEditCategory}
                onCancel={() => setEditingCat(null)}
                saveLabel="Update"
              />
            </View>
          ) : (
            <View key={cat.id} style={[styles.catItem, { backgroundColor: colors.card }]}>
              <View style={[styles.catIconBox, { backgroundColor: (cat.color || '#6B7280') + '22' }]}>
                <Feather name={(cat.icon || 'more-horizontal') as any} size={18} color={cat.color || '#6B7280'} />
              </View>
              <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
              {isBuiltIn && (
                <View style={[styles.defaultBadge, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.defaultBadgeText, { color: colors.textFaint }]}>Built-in</Text>
                </View>
              )}
              <View style={styles.catActions}>
                <TouchableOpacity
                  onPress={() => { setEditingCat(cat); setShowNewCatForm(false); }}
                  style={[styles.catActionBtn, { backgroundColor: colors.primaryBg }]}
                >
                  <Feather name="edit-2" size={15} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteCategory(cat)}
                  style={[styles.catActionBtn, { backgroundColor: colors.dangerBg }]}
                >
                  <Feather name="trash-2" size={15} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ height: 40 }} />

      <Modal
        visible={showRestoreModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRestoreModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg, paddingTop: STATUS_BAR_HEIGHT }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Restore Backup</Text>
            <TouchableOpacity onPress={() => setShowRestoreModal(false)} style={styles.modalClose}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalInstr, { backgroundColor: colors.primaryBg, color: colors.textSub }]}>
              1. Open your saved backup file{'\n'}
              2. Copy all the text{'\n'}
              3. Paste it below{'\n'}
              4. Tap Restore — duplicates are skipped automatically
            </Text>
            <TextInput
              style={[styles.jsonInput, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border }]}
              value={restoreJson}
              onChangeText={setRestoreJson}
              placeholder={'Paste backup JSON here...\n{"version":1,"transactions":[...]}'}
              placeholderTextColor={colors.placeholder}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.restoreConfirmBtn, { backgroundColor: colors.success }, restoring && { opacity: 0.6 }]}
              onPress={confirmRestore}
              disabled={restoring}
            >
              <Feather name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.restoreConfirmText}>{restoring ? 'Restoring...' : 'Restore'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  catHint: { fontSize: 12, marginBottom: 10, fontStyle: 'italic' },
  addCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addCatBtnText: { fontSize: 13, fontWeight: '600' },
  card: { borderRadius: 16, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardSubTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  editingCatHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  backupRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  backupIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backupInfo: { flex: 1 },
  backupTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  backupSub: { fontSize: 13, lineHeight: 18 },
  backupBtns: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  backupBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1 },
  backupBtnText: { fontSize: 14, fontWeight: '600' },
  backupNote: { fontSize: 12, lineHeight: 17 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderLabel: { fontSize: 15, fontWeight: '600' },
  reminderSub: { fontSize: 13, marginTop: 2 },
  timeDivider: { height: 1, marginVertical: 14 },
  timePickerLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  timeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  timeChipText: { fontSize: 14, fontWeight: '500' },
  notAvailableText: { fontSize: 12, marginTop: 10, fontStyle: 'italic', textAlign: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addInput: { flex: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addBtn: { borderRadius: 8, width: 42, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  sourceChipText: { fontSize: 13, fontWeight: '500' },
  catItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  catIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catName: { flex: 1, fontSize: 15, fontWeight: '600' },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 4 },
  defaultBadgeText: { fontSize: 11, fontWeight: '500' },
  defaultBadgeSmall: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  defaultBadgeSmallText: { fontSize: 11, fontWeight: '600' },
  catActions: { flexDirection: 'row', gap: 4 },
  catActionBtn: { padding: 8, borderRadius: 8 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { padding: 4 },
  modalBody: { flex: 1, padding: 20 },
  modalInstr: { fontSize: 14, lineHeight: 22, marginBottom: 16, padding: 14, borderRadius: 12 },
  jsonInput: { borderRadius: 12, padding: 14, fontSize: 13, minHeight: 200, textAlignVertical: 'top', fontFamily: 'monospace', borderWidth: 1, marginBottom: 16 },
  restoreConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  restoreConfirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});

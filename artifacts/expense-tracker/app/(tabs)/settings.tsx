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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Category, getCategories, addCategory, updateCategory, deleteCategory, createBackup, restoreBackup, BackupData } from '../../lib/database';
import { getPaymentSources, addPaymentSource, removePaymentSource } from '../../lib/paymentSources';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CategoryForm from '../../components/CategoryForm';
import { Share } from 'react-native';

const REMINDER_KEY = 'evening_reminder';

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
    setCategories(getCategories());
    setPaymentSources(await getPaymentSources());
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
          content: {
            title: 'Log your expenses',
            body: "Time to record today's transactions!",
            sound: true,
          },
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
      const txCount = backup.transactions.length;
      await Share.share({
        message: json,
        title: `ExpenseTracker Backup — ${txCount} transactions`,
      });
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message ?? 'Could not create backup.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = () => {
    setRestoreJson('');
    setShowRestoreModal(true);
  };

  const confirmRestore = () => {
    if (!restoreJson.trim()) {
      Alert.alert('Empty', 'Please paste your backup JSON first.');
      return;
    }
    let data: BackupData;
    try {
      data = JSON.parse(restoreJson.trim());
    } catch {
      Alert.alert('Invalid JSON', 'The pasted text is not valid JSON. Please copy the backup text exactly.');
      return;
    }
    Alert.alert(
      'Restore Backup',
      `This will add ${data.transactions?.length ?? 0} transactions to your app. Existing data will NOT be deleted — duplicates are skipped automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = restoreBackup(data);
              setShowRestoreModal(false);
              Alert.alert(
                'Restore Complete',
                `Added ${result.inserted} new transactions. ${result.skipped > 0 ? `${result.skipped} skipped (duplicates or invalid).` : ''}`,
                [{ text: 'OK' }]
              );
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
    addCategory({ name, icon, color, isDefault: false });
    setShowNewCatForm(false);
    setCategories(getCategories());
  };

  const handleEditCategory = (name: string, icon: string, color: string) => {
    if (!editingCat) return;
    updateCategory(editingCat.id, { name, icon, color });
    setEditingCat(null);
    setCategories(getCategories());
  };

  const handleDeleteCategory = (cat: Category) => {
    if (cat.isDefault) {
      Alert.alert('Cannot Delete', 'Default categories cannot be deleted.');
      return;
    }
    Alert.alert('Delete Category', `Delete "${cat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => { deleteCategory(cat.id); setCategories(getCategories()); },
      },
    ]);
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
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => { setPaymentSources(await removePaymentSource(source)); },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Backup & Restore</Text>
        <View style={styles.card}>
          <View style={styles.backupRow}>
            <View style={styles.backupIconWrap}>
              <Feather name="database" size={22} color="#6366F1" />
            </View>
            <View style={styles.backupInfo}>
              <Text style={styles.backupTitle}>Backup your data</Text>
              <Text style={styles.backupSub}>Export all transactions as JSON. Save it to Drive or email to yourself.</Text>
            </View>
          </View>
          <View style={styles.backupBtns}>
            <TouchableOpacity style={styles.backupBtn} onPress={handleBackup} disabled={backingUp}>
              <Feather name="upload" size={16} color="#6366F1" />
              <Text style={styles.backupBtnText}>{backingUp ? 'Preparing...' : 'Export Backup'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupBtn, styles.restoreBtn]} onPress={handleRestore}>
              <Feather name="download" size={16} color="#10B981" />
              <Text style={[styles.backupBtnText, { color: '#10B981' }]}>Restore</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.backupNote}>To transfer to a new phone: export → save the file → open Expense Tracker on the new phone → paste JSON in Restore.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evening Reminder</Text>
        <View style={styles.card}>
          <View style={styles.reminderToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderLabel}>Daily Expense Reminder</Text>
              <Text style={styles.reminderSub}>
                {reminderEnabled ? `Notifying at ${selectedTimeLabel}` : 'Get notified to log expenses every evening'}
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ false: '#E5E7EB', true: '#A5B4FC' }}
              thumbColor={reminderEnabled ? '#6366F1' : '#9CA3AF'}
            />
          </View>

          {reminderEnabled && (
            <>
              <View style={styles.timeDivider} />
              <Text style={styles.timePickerLabel}>Choose reminder time</Text>
              <View style={styles.timeChips}>
                {EVENING_HOURS.map(opt => {
                  const isSelected = reminderHour === opt.hour && reminderMinute === opt.minute;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                      onPress={() => handleSelectTime(opt.hour, opt.minute)}
                    >
                      <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {Platform.OS === 'web' && (
                <Text style={styles.notAvailableText}>Push notifications require the Android APK build.</Text>
              )}
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Sources</Text>
        <View style={styles.card}>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newSource}
              onChangeText={setNewSource}
              placeholder="e.g. HDFC Card, Paytm..."
              placeholderTextColor="#9CA3AF"
              onSubmitEditing={handleAddSource}
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleAddSource}>
              <Feather name="plus" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.chipWrap}>
            {paymentSources.map(source => (
              <View key={source} style={styles.sourceChip}>
                <Text style={styles.sourceChipText}>{source}</Text>
                <TouchableOpacity onPress={() => handleRemoveSource(source)} style={{ padding: 2 }}>
                  <Feather name="x" size={13} color="#6B7280" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <TouchableOpacity
            style={styles.addCatBtn}
            onPress={() => { setShowNewCatForm(true); setEditingCat(null); }}
          >
            <Feather name="plus" size={14} color="#6366F1" />
            <Text style={styles.addCatBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {showNewCatForm && (
          <View style={styles.card}>
            <Text style={styles.cardSubTitle}>New Category</Text>
            <CategoryForm
              onSave={handleAddCategory}
              onCancel={() => setShowNewCatForm(false)}
              saveLabel="Add Category"
            />
          </View>
        )}

        {categories.map(cat => (
          editingCat?.id === cat.id ? (
            <View key={cat.id} style={[styles.card, { marginBottom: 8 }]}>
              <Text style={styles.cardSubTitle}>Edit: {cat.name}</Text>
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
            <View key={cat.id} style={styles.catItem}>
              <View style={[styles.catIconBox, { backgroundColor: cat.color + '22' }]}>
                <Feather name={cat.icon as any} size={18} color={cat.color} />
              </View>
              <Text style={styles.catName}>{cat.name}</Text>
              {cat.isDefault ? (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              ) : (
                <View style={styles.catActions}>
                  <TouchableOpacity onPress={() => { setEditingCat(cat); setShowNewCatForm(false); }} style={styles.catActionBtn}>
                    <Feather name="edit-2" size={15} color="#6366F1" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteCategory(cat)} style={styles.catActionBtn}>
                    <Feather name="trash-2" size={15} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        ))}
      </View>

      <View style={{ height: 40 }} />

      <Modal visible={showRestoreModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRestoreModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Restore Backup</Text>
            <TouchableOpacity onPress={() => setShowRestoreModal(false)} style={styles.modalClose}>
              <Feather name="x" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalInstr}>
              1. Open your saved backup file{'\n'}
              2. Copy all the text{'\n'}
              3. Paste it below{'\n'}
              4. Tap Restore — duplicates are skipped automatically
            </Text>
            <TextInput
              style={styles.jsonInput}
              value={restoreJson}
              onChangeText={setRestoreJson}
              placeholder={'Paste backup JSON here...\n{"version":1,"transactions":[...]}'}
              placeholderTextColor="#9CA3AF"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.restoreConfirmBtn, restoring && { opacity: 0.6 }]}
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  addCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addCatBtnText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardSubTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  backupRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  backupIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  backupInfo: { flex: 1 },
  backupTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  backupSub: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  backupBtns: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  backupBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  restoreBtn: { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  backupBtnText: { fontSize: 14, fontWeight: '600', color: '#6366F1' },
  backupNote: { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  reminderSub: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  timeDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 14 },
  timePickerLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  timeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: 'transparent',
  },
  timeChipSelected: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  timeChipText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  timeChipTextSelected: { color: '#6366F1', fontWeight: '700' },
  notAvailableText: { fontSize: 12, color: '#9CA3AF', marginTop: 10, fontStyle: 'italic', textAlign: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addInput: {
    flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, color: '#111827',
  },
  addBtn: { backgroundColor: '#6366F1', borderRadius: 8, width: 42, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  sourceChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  catItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 12, marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  catIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  defaultBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  defaultBadgeText: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  catActions: { flexDirection: 'row', gap: 4 },
  catActionBtn: { padding: 8 },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalClose: { padding: 4 },
  modalBody: { flex: 1, padding: 20 },
  modalInstr: { fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 16, backgroundColor: '#EEF2FF', padding: 14, borderRadius: 12 },
  jsonInput: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, fontSize: 13,
    color: '#111827', minHeight: 200, textAlignVertical: 'top', fontFamily: 'monospace',
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16,
  },
  restoreConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 14,
  },
  restoreConfirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});

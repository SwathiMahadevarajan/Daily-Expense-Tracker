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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Category, getCategories, addCategory, updateCategory, deleteCategory } from '../../lib/database';
import { getPaymentSources, addPaymentSource, removePaymentSource } from '../../lib/paymentSources';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CategoryForm from '../../components/CategoryForm';

const REMINDER_KEY = 'evening_reminder';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export default function SettingsScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState('20');
  const [reminderMinute, setReminderMinute] = useState('00');
  const [newSource, setNewSource] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [showHourPicker, setShowHourPicker] = useState(false);
  const [showMinutePicker, setShowMinutePicker] = useState(false);

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
    if (enabled && Platform.OS !== 'web') {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.requestPermissionsAsync();
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Time to log your expenses!',
            body: "Don't forget to record today's transactions.",
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parseInt(hour),
            minute: parseInt(minute),
          },
        });
      } catch (e) {
        console.log('Notifications not available:', e);
      }
    } else if (!enabled && Platform.OS !== 'web') {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch {}
    }
  };

  const handleToggleReminder = async (value: boolean) => {
    setReminderEnabled(value);
    await saveReminder(value, reminderHour, reminderMinute);
  };

  const handleTimeChange = async (hour: string, minute: string) => {
    setReminderHour(hour);
    setReminderMinute(minute);
    if (reminderEnabled) await saveReminder(true, hour, minute);
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
        onPress: () => {
          deleteCategory(cat.id);
          setCategories(getCategories());
        },
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
        onPress: async () => {
          const updated = await removePaymentSource(source);
          setPaymentSources(updated);
        },
      },
    ]);
  };

  const formattedTime = `${reminderHour}:${reminderMinute}`;
  const formattedTimeFull = (() => {
    const h = parseInt(reminderHour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, '0')}:${reminderMinute} ${ampm}`;
  })();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evening Reminder</Text>
        <View style={styles.card}>
          <View style={styles.reminderToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderLabel}>Daily Expense Reminder</Text>
              <Text style={styles.reminderSub}>Get notified to log today's expenses</Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ false: '#E5E7EB', true: '#A5B4FC' }}
              thumbColor={reminderEnabled ? '#6366F1' : '#9CA3AF'}
            />
          </View>

          {reminderEnabled && (
            <View style={styles.timePickerContainer}>
              <View style={styles.timeDivider} />
              <Text style={styles.timePickerLabel}>Reminder Time</Text>
              <View style={styles.timeDisplayRow}>
                <Feather name="clock" size={18} color="#6366F1" />
                <Text style={styles.timeDisplayText}>{formattedTimeFull}</Text>
              </View>
              <View style={styles.timePickersRow}>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerHeader}>Hour</Text>
                  <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                    {HOURS.map(h => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timePickerItem, reminderHour === h && styles.timePickerItemActive]}
                        onPress={() => handleTimeChange(h, reminderMinute)}
                      >
                        <Text style={[styles.timePickerItemText, reminderHour === h && styles.timePickerItemTextActive]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <Text style={styles.timeColon}>:</Text>
                <View style={styles.timePickerColumn}>
                  <Text style={styles.timePickerHeader}>Min</Text>
                  <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                    {MINUTES.map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.timePickerItem, reminderMinute === m && styles.timePickerItemActive]}
                        onPress={() => handleTimeChange(reminderHour, m)}
                      >
                        <Text style={[styles.timePickerItemText, reminderMinute === m && styles.timePickerItemTextActive]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
              {Platform.OS === 'web' && (
                <Text style={styles.notAvailableText}>
                  Push notifications require a device build. Settings are saved.
                </Text>
              )}
            </View>
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
              placeholder="Add new source..."
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  addCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addCatBtnText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSubTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  reminderSub: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  timePickerContainer: { marginTop: 12 },
  timeDivider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 },
  timePickerLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  timeDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  timeDisplayText: { fontSize: 20, fontWeight: '700', color: '#111827' },
  timePickersRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timePickerColumn: { flex: 1 },
  timePickerHeader: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', textAlign: 'center', marginBottom: 6 },
  timePickerScroll: { height: 140, backgroundColor: '#F9FAFB', borderRadius: 10 },
  timePickerItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
  timePickerItemActive: { backgroundColor: '#6366F1' },
  timePickerItemText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  timePickerItemTextActive: { color: '#FFFFFF', fontWeight: '700' },
  timeColon: { fontSize: 24, fontWeight: '700', color: '#374151', marginTop: 16 },
  notAvailableText: { fontSize: 12, color: '#9CA3AF', marginTop: 10, fontStyle: 'italic', textAlign: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  addBtn: { backgroundColor: '#6366F1', borderRadius: 8, width: 42, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sourceChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  iconChoice: { padding: 10, borderRadius: 8, marginRight: 6, backgroundColor: '#F3F4F6' },
  iconChoiceActive: { backgroundColor: '#EEF2FF', borderWidth: 1.5, borderColor: '#6366F1' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotActive: { borderWidth: 3, borderColor: '#111827', transform: [{ scale: 1.15 }] },
  catBtns: { flexDirection: 'row', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  cancelBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  catItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  catIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  defaultBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  defaultBadgeText: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  catActions: { flexDirection: 'row', gap: 4 },
  catActionBtn: { padding: 8 },
});

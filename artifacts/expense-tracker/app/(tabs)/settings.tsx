import React, { useState, useEffect, useCallback } from 'react';
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

const REMINDER_KEY = 'evening_reminder';

const VALID_ICONS = [
  'coffee', 'truck', 'shopping-bag', 'zap', 'film', 'heart', 'package',
  'book', 'map-pin', 'trending-up', 'more-horizontal', 'home', 'music',
  'gift', 'phone', 'monitor', 'dollar-sign', 'briefcase', 'user', 'star',
  'flag', 'tag', 'inbox', 'mail', 'bell', 'wifi', 'credit-card',
];

const CATEGORY_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F97316', '#06B6D4', '#84CC16', '#22C55E', '#6366F1', '#6B7280',
];

export default function SettingsScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('more-horizontal');
  const [newCatColor, setNewCatColor] = useState('#6B7280');
  const [newSource, setNewSource] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const loadData = useCallback(async () => {
    setCategories(getCategories());
    setPaymentSources(await getPaymentSources());
    try {
      const rem = await AsyncStorage.getItem(REMINDER_KEY);
      if (rem) {
        const { enabled, time } = JSON.parse(rem);
        setReminderEnabled(enabled);
        setReminderTime(time);
      }
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const saveReminder = async (enabled: boolean, time: string) => {
    await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled, time }));
    if (enabled && Platform.OS !== 'web') {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.requestPermissionsAsync();
        await Notifications.cancelAllScheduledNotificationsAsync();
        const [h, m] = time.split(':').map(Number);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Time to log expenses!',
            body: "Don't forget to record today's transactions.",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: h,
            minute: m,
          },
        });
      } catch (e) {
        console.log('Notifications not available:', e);
      }
    }
  };

  const handleToggleReminder = async (value: boolean) => {
    setReminderEnabled(value);
    await saveReminder(value, reminderTime);
  };

  const handleTimeChange = async (time: string) => {
    setReminderTime(time);
    if (reminderEnabled) await saveReminder(true, time);
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      Alert.alert('Name required', 'Please enter a category name.');
      return;
    }
    if (editingCat) {
      updateCategory(editingCat.id, { name: newCatName.trim(), icon: newCatIcon, color: newCatColor });
      setEditingCat(null);
    } else {
      addCategory({ name: newCatName.trim(), icon: newCatIcon, color: newCatColor, isDefault: false });
    }
    setNewCatName('');
    setNewCatIcon('more-horizontal');
    setNewCatColor('#6B7280');
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
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCategory(cat.id);
          setCategories(getCategories());
        },
      },
    ]);
  };

  const startEditCategory = (cat: Category) => {
    setEditingCat(cat);
    setNewCatName(cat.name);
    setNewCatIcon(cat.icon);
    setNewCatColor(cat.color);
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
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = await removePaymentSource(source);
          setPaymentSources(updated);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evening Reminder</Text>
        <View style={styles.card}>
          <View style={styles.reminderRow}>
            <View>
              <Text style={styles.reminderLabel}>Daily Reminder</Text>
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
            <View style={styles.timeRow}>
              <Feather name="clock" size={16} color="#6B7280" />
              <TextInput
                style={styles.timeInput}
                value={reminderTime}
                onChangeText={handleTimeChange}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          )}
          {Platform.OS === 'web' && (
            <Text style={styles.notAvailableText}>Reminders require a device build</Text>
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
                <TouchableOpacity onPress={() => handleRemoveSource(source)}>
                  <Feather name="x" size={14} color="#6B7280" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{editingCat ? 'Edit Category' : 'Add Category'}</Text>
          <TextInput
            style={styles.input}
            value={newCatName}
            onChangeText={setNewCatName}
            placeholder="Category name"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.fieldLabel}>Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {VALID_ICONS.map(icon => (
              <TouchableOpacity
                key={icon}
                style={[styles.iconChoice, newCatIcon === icon && styles.iconChoiceActive]}
                onPress={() => setNewCatIcon(icon)}
              >
                <Feather name={icon as any} size={18} color={newCatIcon === icon ? '#6366F1' : '#6B7280'} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.fieldLabel}>Color</Text>
          <View style={styles.colorRow}>
            {CATEGORY_COLORS.map(color => (
              <TouchableOpacity
                key={color}
                style={[styles.colorDot, { backgroundColor: color }, newCatColor === color && styles.colorDotActive]}
                onPress={() => setNewCatColor(color)}
              />
            ))}
          </View>
          <View style={styles.catBtns}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddCategory}>
              <Text style={styles.saveBtnText}>{editingCat ? 'Update' : 'Add Category'}</Text>
            </TouchableOpacity>
            {editingCat && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditingCat(null); setNewCatName(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {categories.map(cat => (
          <View key={cat.id} style={styles.catItem}>
            <View style={[styles.catIconBox, { backgroundColor: cat.color + '20' }]}>
              <Feather name={cat.icon as any} size={18} color={cat.color} />
            </View>
            <Text style={styles.catName}>{cat.name}</Text>
            {cat.isDefault ? (
              <Text style={styles.defaultBadge}>Default</Text>
            ) : (
              <View style={styles.catActions}>
                <TouchableOpacity onPress={() => startEditCategory(cat)} style={styles.catActionBtn}>
                  <Feather name="edit-2" size={16} color="#6366F1" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteCategory(cat)} style={styles.catActionBtn}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  reminderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reminderLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  reminderSub: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  timeInput: { fontSize: 16, color: '#111827', fontWeight: '600' },
  notAvailableText: { fontSize: 12, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' },
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
  addBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  iconChoiceActive: { backgroundColor: '#EEF2FF' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { borderWidth: 3, borderColor: '#6366F1' },
  catBtns: { flexDirection: 'row', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  catItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  catIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  defaultBadge: { fontSize: 12, color: '#9CA3AF', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catActions: { flexDirection: 'row', gap: 8 },
  catActionBtn: { padding: 6 },
});

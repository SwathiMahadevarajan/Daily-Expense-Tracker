import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export const VALID_ICONS = [
  'coffee', 'truck', 'shopping-bag', 'zap', 'film', 'heart', 'package',
  'book', 'map-pin', 'trending-up', 'more-horizontal', 'home', 'music',
  'gift', 'phone', 'monitor', 'dollar-sign', 'briefcase', 'user', 'star',
  'flag', 'tag', 'inbox', 'mail', 'bell', 'wifi', 'credit-card', 'camera',
  'sun', 'moon', 'umbrella', 'tool', 'scissors', 'activity', 'award',
];

export const CATEGORY_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F97316', '#06B6D4', '#84CC16', '#22C55E', '#6366F1', '#6B7280',
  '#14B8A6', '#A855F7', '#F43F5E', '#0EA5E9',
];

interface Props {
  initialName?: string;
  initialIcon?: string;
  initialColor?: string;
  onSave: (name: string, icon: string, color: string) => void;
  onCancel?: () => void;
  saveLabel?: string;
}

export default function CategoryForm({
  initialName = '',
  initialIcon = 'more-horizontal',
  initialColor = '#6B7280',
  onSave,
  onCancel,
  saveLabel = 'Save',
}: Props) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor);

  return (
    <View>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Category name"
        placeholderTextColor="#9CA3AF"
        autoFocus
      />
      <Text style={styles.fieldLabel}>Icon</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {VALID_ICONS.map(ic => (
          <TouchableOpacity
            key={ic}
            style={[styles.iconChoice, icon === ic && styles.iconChoiceActive]}
            onPress={() => setIcon(ic)}
          >
            <Feather name={ic as any} size={18} color={icon === ic ? '#6366F1' : '#6B7280'} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.fieldLabel}>Color</Text>
      <View style={styles.colorRow}>
        {CATEGORY_COLORS.map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
            onPress={() => setColor(c)}
          />
        ))}
      </View>
      <View style={styles.catBtns}>
        <TouchableOpacity
          style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
          onPress={() => { if (name.trim()) onSave(name.trim(), icon, color); }}
          disabled={!name.trim()}
        >
          <Text style={styles.saveBtnText}>{saveLabel}</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
});

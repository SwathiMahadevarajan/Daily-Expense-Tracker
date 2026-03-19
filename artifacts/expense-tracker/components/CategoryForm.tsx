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
import { useTheme } from '../lib/theme';

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
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(VALID_ICONS.includes(initialIcon) ? initialIcon : 'more-horizontal');
  const [color, setColor] = useState(initialColor);

  return (
    <View>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, color: colors.inputText }]}
        value={name}
        onChangeText={setName}
        placeholder="Category name"
        placeholderTextColor={colors.placeholder}
        autoFocus
      />
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Icon</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {VALID_ICONS.map(ic => (
          <TouchableOpacity
            key={ic}
            style={[
              styles.iconChoice,
              { backgroundColor: colors.cardAlt },
              icon === ic && { backgroundColor: colors.primaryBg, borderColor: colors.primary, borderWidth: 1.5 },
            ]}
            onPress={() => setIcon(ic)}
          >
            <Feather name={ic as any} size={18} color={icon === ic ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Color</Text>
      <View style={styles.colorRow}>
        {CATEGORY_COLORS.map(c => (
          <TouchableOpacity
            key={c}
            style={[
              styles.colorDot,
              { backgroundColor: c },
              color === c && { borderWidth: 3, borderColor: colors.text, transform: [{ scale: 1.15 }] },
            ]}
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
          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: colors.cardAlt }]}
            onPress={onCancel}
          >
            <Text style={[styles.cancelBtnText, { color: colors.textSub }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  iconChoice: { padding: 10, borderRadius: 8, marginRight: 6 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  catBtns: { flexDirection: 'row', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#D1D5DB' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  cancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  cancelBtnText: { fontWeight: '600', fontSize: 14 },
});

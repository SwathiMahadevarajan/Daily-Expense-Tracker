import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Transaction, addTransaction, updateTransaction, getCategories, addCategory, Category } from '../lib/database';
import CategoryForm from './CategoryForm';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editTransaction?: Transaction | null;
  paymentSources: string[];
}

export default function AddTransactionModal({ visible, onClose, onSaved, editTransaction, paymentSources }: Props) {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bank, setBank] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showNewCat, setShowNewCat] = useState(false);

  const loadCategories = () => {
    const cats = getCategories();
    setCategories(cats);
    return cats;
  };

  useEffect(() => {
    if (visible) {
      const cats = loadCategories();
      if (editTransaction) {
        setAmount(editTransaction.amount.toString());
        setType(editTransaction.type);
        setCategory(editTransaction.category);
        setDescription(editTransaction.description);
        setNote(editTransaction.note);
        setDate(editTransaction.date);
        setBank(editTransaction.bank);
      } else {
        setAmount('');
        setType('debit');
        setCategory(cats.length > 0 ? cats[0].name : '');
        setDescription('');
        setNote('');
        setDate(new Date().toISOString().slice(0, 10));
        setBank('');
      }
      setShowNewCat(false);
    }
  }, [visible, editTransaction]);

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!category) {
      Alert.alert('Category Required', 'Please select a category.');
      return;
    }

    const tx = { amount: amt, type, category, description, note, date, bank };
    if (editTransaction) {
      updateTransaction(editTransaction.id, tx);
    } else {
      addTransaction(tx);
    }
    onSaved();
    onClose();
  };

  const handleCreateCategory = (name: string, icon: string, color: string) => {
    addCategory({ name, icon, color, isDefault: false });
    const cats = loadCategories();
    setCategory(name);
    setShowNewCat(false);
  };

  const selectedCat = categories.find(c => c.name === category);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Feather name="x" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{editTransaction ? 'Edit Transaction' : 'Add Transaction'}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
            <Text style={styles.saveBtn}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'debit' && styles.typeBtnDebitActive]}
              onPress={() => setType('debit')}
            >
              <Feather name="arrow-up-right" size={16} color={type === 'debit' ? '#FFFFFF' : '#EF4444'} />
              <Text style={[styles.typeBtnText, type === 'debit' && styles.typeBtnTextActive]}>Debit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'credit' && styles.typeBtnCreditActive]}
              onPress={() => setType('credit')}
            >
              <Feather name="arrow-down-left" size={16} color={type === 'credit' ? '#FFFFFF' : '#10B981'} />
              <Text style={[styles.typeBtnText, type === 'credit' && styles.typeBtnTextActive]}>Credit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.amountContainer}>
            <Text style={styles.amountSymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor="#9CA3AF"
              autoFocus={!editTransaction}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Category</Text>
              <TouchableOpacity
                style={styles.newCatBtn}
                onPress={() => setShowNewCat(!showNewCat)}
              >
                <Feather name={showNewCat ? 'chevron-up' : 'plus'} size={13} color="#6366F1" />
                <Text style={styles.newCatBtnText}>{showNewCat ? 'Cancel' : 'New'}</Text>
              </TouchableOpacity>
            </View>

            {showNewCat ? (
              <View style={styles.inlineForm}>
                <CategoryForm
                  onSave={handleCreateCategory}
                  onCancel={() => setShowNewCat(false)}
                  saveLabel="Create & Select"
                />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.chip,
                      category === cat.name && { backgroundColor: cat.color, borderColor: cat.color },
                    ]}
                    onPress={() => setCategory(cat.name)}
                  >
                    <Feather
                      name={cat.icon as any}
                      size={13}
                      color={category === cat.name ? '#FFFFFF' : cat.color}
                    />
                    <Text style={[styles.chipText, category === cat.name && styles.chipTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="What was this for?"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Bank / Payment Source</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {paymentSources.map(source => (
                <TouchableOpacity
                  key={source}
                  style={[styles.chip, bank === source && styles.chipActive]}
                  onPress={() => setBank(bank === source ? '' : source)}
                >
                  <Text style={[styles.chipText, bank === source && styles.chipTextActive]}>{source}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={bank}
              onChangeText={setBank}
              placeholder="Or type manually..."
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  saveBtn: { fontSize: 16, fontWeight: '700', color: '#6366F1' },
  form: { flex: 1, padding: 16 },
  typeToggle: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  typeBtnDebitActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  typeBtnCreditActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  typeBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  typeBtnTextActive: { color: '#FFFFFF' },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  amountSymbol: { fontSize: 28, fontWeight: '700', color: '#9CA3AF', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '700', color: '#111827', paddingVertical: 14 },
  field: { marginBottom: 18 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 },
  newCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newCatBtnText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  inlineForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipScroll: { flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF' },
});

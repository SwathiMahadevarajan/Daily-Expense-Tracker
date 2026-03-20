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
  Platform,
  StatusBar,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Transaction, addTransaction, updateTransaction, getCategories, addCategory, Category } from '../lib/database';
import CategoryForm from './CategoryForm';
import { useTheme } from '../lib/theme';

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editTransaction?: Transaction | null;
  paymentSources: string[];
}

export default function AddTransactionModal({ visible, onClose, onSaved, editTransaction, paymentSources }: Props) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [isTransfer, setIsTransfer] = useState(false);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bank, setBank] = useState('');
  const [transferTo, setTransferTo] = useState('');
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
        setIsTransfer(!!(editTransaction.transfer_to));
        setCategory(editTransaction.category);
        setDescription(editTransaction.description);
        setNote(editTransaction.note);
        setDate(editTransaction.date);
        setBank(editTransaction.bank);
        setTransferTo(editTransaction.transfer_to ?? '');
      } else {
        setAmount('');
        setType('debit');
        setIsTransfer(false);
        setCategory(cats.length > 0 ? cats[0].name : '');
        setDescription('');
        setNote('');
        setDate(new Date().toISOString().slice(0, 10));
        setBank('');
        setTransferTo('');
      }
      setShowNewCat(false);
    }
  }, [visible, editTransaction]);

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.'); return; }

    if (isTransfer) {
      if (!bank) { Alert.alert('Source Required', 'Please select the source account.'); return; }
      if (!transferTo) { Alert.alert('Destination Required', 'Please select the destination account.'); return; }
      if (bank === transferTo) { Alert.alert('Invalid Transfer', 'Source and destination cannot be the same.'); return; }
      const tx = { amount: amt, type: 'debit' as const, category: 'Transfer', description: description || `Transfer to ${transferTo}`, note, date, bank, transfer_to: transferTo };
      if (editTransaction) { updateTransaction(editTransaction.id, tx); } else { addTransaction(tx); }
    } else {
      if (!category) { Alert.alert('Category Required', 'Please select a category.'); return; }
      const tx = { amount: amt, type, category, description, note, date, bank, transfer_to: null };
      if (editTransaction) { updateTransaction(editTransaction.id, tx); } else { addTransaction(tx); }
    }
    onSaved();
    onClose();
  };

  const handleCreateCategory = (name: string, icon: string, color: string) => {
    addCategory({ name, icon, color, isDefault: false });
    loadCategories();
    setCategory(name);
    setShowNewCat(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: STATUS_BAR_HEIGHT }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Feather name="x" size={22} color={colors.textSub} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {editTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
            <Text style={[styles.saveBtn, { color: colors.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }, !isTransfer && type === 'debit' && { backgroundColor: colors.danger, borderColor: colors.danger }]}
              onPress={() => { setIsTransfer(false); setType('debit'); }}
            >
              <Feather name="arrow-up-right" size={16} color={!isTransfer && type === 'debit' ? '#FFFFFF' : colors.danger} />
              <Text style={[styles.typeBtnText, { color: !isTransfer && type === 'debit' ? '#FFFFFF' : colors.textSub }]}>Debit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }, !isTransfer && type === 'credit' && { backgroundColor: colors.success, borderColor: colors.success }]}
              onPress={() => { setIsTransfer(false); setType('credit'); }}
            >
              <Feather name="arrow-down-left" size={16} color={!isTransfer && type === 'credit' ? '#FFFFFF' : colors.success} />
              <Text style={[styles.typeBtnText, { color: !isTransfer && type === 'credit' ? '#FFFFFF' : colors.textSub }]}>Credit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }, isTransfer && { backgroundColor: colors.textMuted, borderColor: colors.textMuted }]}
              onPress={() => setIsTransfer(true)}
            >
              <Feather name="repeat" size={16} color={isTransfer ? '#FFFFFF' : colors.textMuted} />
              <Text style={[styles.typeBtnText, { color: isTransfer ? '#FFFFFF' : colors.textSub }]}>Transfer</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.amountContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.amountSymbol, { color: colors.textFaint }]}>₹</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.text }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.placeholder}
              autoFocus={!editTransaction}
            />
          </View>

          {isTransfer ? (
            <>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>From Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {paymentSources.map(source => (
                    <TouchableOpacity
                      key={source}
                      style={[styles.chip, { backgroundColor: colors.inputBg, borderColor: colors.border }, bank === source && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                      onPress={() => setBank(source)}
                    >
                      <Feather name="credit-card" size={13} color={bank === source ? '#FFFFFF' : colors.textMuted} />
                      <Text style={[styles.chipText, { color: bank === source ? '#FFFFFF' : colors.textSub }]}>{source}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border, marginTop: 8 }]}
                  value={bank}
                  onChangeText={setBank}
                  placeholder="Or type source manually..."
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={[styles.transferArrow, { backgroundColor: colors.cardAlt }]}>
                <Feather name="arrow-down" size={18} color={colors.textMuted} />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>To Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {paymentSources.filter(s => s !== bank).map(source => (
                    <TouchableOpacity
                      key={source}
                      style={[styles.chip, { backgroundColor: colors.inputBg, borderColor: colors.border }, transferTo === source && { backgroundColor: colors.success, borderColor: colors.success }]}
                      onPress={() => setTransferTo(source)}
                    >
                      <Feather name="credit-card" size={13} color={transferTo === source ? '#FFFFFF' : colors.textMuted} />
                      <Text style={[styles.chipText, { color: transferTo === source ? '#FFFFFF' : colors.textSub }]}>{source}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border, marginTop: 8 }]}
                  value={transferTo}
                  onChangeText={setTransferTo}
                  placeholder="Or type destination manually..."
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Monthly savings transfer"
                  placeholderTextColor={colors.placeholder}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.field}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
                  <TouchableOpacity
                    style={[styles.newCatBtn, { backgroundColor: colors.primaryBg }]}
                    onPress={() => setShowNewCat(!showNewCat)}
                  >
                    <Feather name={showNewCat ? 'chevron-up' : 'plus'} size={13} color={colors.primary} />
                    <Text style={[styles.newCatBtnText, { color: colors.primary }]}>{showNewCat ? 'Cancel' : 'New'}</Text>
                  </TouchableOpacity>
                </View>
                {showNewCat ? (
                  <View style={[styles.inlineForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <CategoryForm onSave={handleCreateCategory} onCancel={() => setShowNewCat(false)} saveLabel="Create & Select" />
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {categories.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.chip,
                          { backgroundColor: colors.inputBg, borderColor: colors.border },
                          category === cat.name && { backgroundColor: cat.color, borderColor: cat.color },
                        ]}
                        onPress={() => setCategory(cat.name)}
                      >
                        <Feather name={cat.icon as any} size={13} color={category === cat.name ? '#FFFFFF' : cat.color} />
                        <Text style={[styles.chipText, { color: category === cat.name ? '#FFFFFF' : colors.textSub }]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Description</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What was this for?"
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border, minHeight: 70, textAlignVertical: 'top' }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note..."
                  placeholderTextColor={colors.placeholder}
                  multiline
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Bank / Payment Source</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {paymentSources.map(source => (
                    <TouchableOpacity
                      key={source}
                      style={[
                        styles.chip,
                        { backgroundColor: colors.inputBg, borderColor: colors.border },
                        bank === source && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => setBank(bank === source ? '' : source)}
                    >
                      <Text style={[styles.chipText, { color: bank === source ? '#FFFFFF' : colors.textSub }]}>{source}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border, marginTop: 8 }]}
                  value={bank}
                  onChangeText={setBank}
                  placeholder="Or type manually..."
                  placeholderTextColor={colors.placeholder}
                />
              </View>
            </>
          )}

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Date</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.inputText, borderColor: colors.border }]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
            />
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: { fontSize: 16, fontWeight: '700' },
  form: { flex: 1, padding: 16 },
  typeToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  typeBtnText: { fontSize: 14, fontWeight: '600' },
  amountContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 16, marginBottom: 20, borderWidth: 1.5 },
  amountSymbol: { fontSize: 28, fontWeight: '700', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '700', paddingVertical: 14 },
  field: { marginBottom: 18 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  newCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  newCatBtnText: { fontSize: 12, fontWeight: '600' },
  inlineForm: { borderRadius: 14, padding: 14, borderWidth: 1 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  chipScroll: { flexDirection: 'row' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: '500' },
  transferArrow: { alignSelf: 'center', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
});

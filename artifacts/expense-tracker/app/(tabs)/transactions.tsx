import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
  Platform,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  Transaction,
  getTransactions,
  deleteTransaction,
  bulkDeleteTransactions,
  bulkUpdateTransactionCategory,
  bulkUpdateTransactionBank,
  getCategories,
  Category,
} from '../../lib/database';
import { getPaymentSources } from '../../lib/paymentSources';
import AddTransactionModal from '../../components/AddTransactionModal';
import { useTheme } from '../../lib/theme';

function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exportToCsv(transactions: Transaction[]): string {
  const header = 'Date,Type,Amount,Category,Description,Bank,Note,SMS Imported,Transfer To';
  const rows = transactions.map(tx =>
    [tx.date, tx.type, tx.amount.toFixed(2),
      `"${tx.category.replace(/"/g, '""')}"`, `"${tx.description.replace(/"/g, '""')}"`,
      `"${tx.bank.replace(/"/g, '""')}"`, `"${tx.note.replace(/"/g, '""')}"`,
      tx.smsId ? 'Yes' : 'No', `"${(tx.transfer_to ?? '').replace(/"/g, '""')}"`].join(',')
  );
  return [header, ...rows].join('\n');
}

export default function TransactionsScreen() {
  const { colors } = useTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filtered, setFiltered] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debit' | 'credit'>('all');
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionModal, setBulkActionModal] = useState<'category' | 'source' | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const loadData = useCallback(() => {
    const txs = getTransactions();
    setTransactions(txs);
    applyFilter(txs, search, filterType);
    getPaymentSources().then(setPaymentSources);
    setCategories(getCategories());
  }, [search, filterType]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const applyFilter = (txs: Transaction[], q: string, type: typeof filterType) => {
    let result = txs;
    if (type !== 'all') result = result.filter(t => t.type === type);
    if (q) {
      const lower = q.toLowerCase();
      result = result.filter(t =>
        t.description.toLowerCase().includes(lower) ||
        t.category.toLowerCase().includes(lower) ||
        t.bank.toLowerCase().includes(lower) ||
        t.note.toLowerCase().includes(lower)
      );
    }
    setFiltered(result);
  };

  const handleSearch = (q: string) => { setSearch(q); applyFilter(transactions, q, filterType); };
  const handleFilterType = (type: typeof filterType) => { setFilterType(type); applyFilter(transactions, search, type); };

  const handleDelete = (tx: Transaction) => {
    Alert.alert('Delete Transaction', `Delete ₹${tx.amount.toFixed(2)} ${tx.type} on ${tx.date}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteTransaction(tx.id); setSelectedTx(null); loadData(); } },
    ]);
  };

  const handleExport = async () => {
    if (filtered.length === 0) { Alert.alert('Nothing to Export', 'No transactions match the current filter.'); return; }
    try { await Share.share({ message: exportToCsv(filtered), title: 'Expense Tracker — Transactions Export' }); }
    catch { Alert.alert('Export Failed', 'Could not share the export.'); }
  };

  const enterBulkMode = (id: number) => {
    setBulkMode(true);
    setSelectedIds(new Set([id]));
    setSelectedTx(null);
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
  };

  const toggleBulkSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert('Delete Transactions', `Delete ${selectedIds.size} selected transaction${selectedIds.size !== 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: () => { bulkDeleteTransactions([...selectedIds]); setSelectedIds(new Set()); setBulkMode(false); loadData(); } },
    ]);
  };

  const handleBulkCategorySelect = (category: string) => { bulkUpdateTransactionCategory([...selectedIds], category); setBulkActionModal(null); setSelectedIds(new Set()); setBulkMode(false); loadData(); };
  const handleBulkSourceSelect = (source: string) => { bulkUpdateTransactionBank([...selectedIds], source); setBulkActionModal(null); setSelectedIds(new Set()); setBulkMode(false); loadData(); };

  const totalShown = filtered.reduce((sum, tx) => sum + (tx.type === 'debit' ? -tx.amount : tx.amount), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
          <Feather name="search" size={16} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, { color: colors.inputText }]}
            value={search}
            onChangeText={handleSearch}
            placeholder="Search transactions..."
            placeholderTextColor={colors.placeholder}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Feather name="x" size={16} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]} onPress={handleExport}>
          <Feather name="share" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['all', 'debit', 'credit'] as const).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.filterBtn, { backgroundColor: colors.cardAlt }, filterType === type && { backgroundColor: colors.primary }]}
            onPress={() => handleFilterType(type)}
          >
            <Text style={[styles.filterBtnText, { color: filterType === type ? '#FFFFFF' : colors.textSub }]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterRight}>
          <Text style={[styles.countText, { color: colors.textFaint }]}>{filtered.length} txns</Text>
          <Text style={[styles.totalText, { color: totalShown >= 0 ? colors.success : colors.danger }]}>
            {totalShown >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalShown))}
          </Text>
        </View>
      </View>

      {bulkMode && (
        <View style={[styles.bulkBar, { backgroundColor: colors.primaryBg, borderBottomColor: colors.primaryBorder }]}>
          <View style={styles.bulkBarTop}>
            <Text style={[styles.bulkCount, { color: colors.primary }]}>{selectedIds.size} selected</Text>
            <TouchableOpacity style={[styles.bulkSelectBtn, { backgroundColor: colors.primaryBorder }]} onPress={() => setSelectedIds(new Set(filtered.map(t => t.id)))}>
              <Text style={[styles.bulkSelectBtnText, { color: '#FFFFFF' }]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkSelectBtn, { backgroundColor: colors.primaryBorder }]} onPress={() => setSelectedIds(new Set())}>
              <Text style={[styles.bulkSelectBtnText, { color: '#FFFFFF' }]}>None</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkCancelBtn, { backgroundColor: colors.card }]} onPress={exitBulkMode}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bulkChipScroll} contentContainerStyle={styles.bulkChipContent}>
            <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: colors.card, borderColor: colors.primaryBorder, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              onPress={() => selectedIds.size > 0 && setBulkActionModal('category')}>
              <Feather name="tag" size={13} color={colors.primary} />
              <Text style={[styles.bulkActionBtnText, { color: colors.primary }]}>Category</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: colors.card, borderColor: colors.primaryBorder, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              onPress={() => selectedIds.size > 0 && setBulkActionModal('source')}>
              <Feather name="credit-card" size={13} color={colors.success} />
              <Text style={[styles.bulkActionBtnText, { color: colors.success }]}>Source</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: colors.card, borderColor: colors.dangerBg, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              onPress={handleBulkDelete}>
              <Feather name="trash-2" size={13} color={colors.danger} />
              <Text style={[styles.bulkActionBtnText, { color: colors.danger }]}>Delete</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={colors.textFaint} />
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>No transactions found</Text>
          </View>
        ) : (
          filtered.map(tx => {
            const isBulkSelected = selectedIds.has(tx.id);
            const isTransfer = !!(tx.transfer_to);
            return (
              <TouchableOpacity
                key={tx.id}
                style={[
                  styles.txItem,
                  { backgroundColor: colors.card },
                  !bulkMode && selectedTx?.id === tx.id && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
                  bulkMode && isBulkSelected && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
                ]}
                onPress={() => {
                  if (bulkMode) { toggleBulkSelect(tx.id); }
                  else { setSelectedTx(selectedTx?.id === tx.id ? null : tx); }
                }}
                onLongPress={() => { if (!bulkMode) enterBulkMode(tx.id); }}
                delayLongPress={350}
                activeOpacity={0.7}
              >
                {bulkMode && (
                  <View style={[styles.bulkCheckbox, { borderColor: colors.border }, isBulkSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {isBulkSelected && <Feather name="check" size={12} color="#FFFFFF" />}
                  </View>
                )}
                <View style={[styles.txIcon, {
                  backgroundColor: isTransfer ? colors.cardAlt : tx.type === 'credit' ? colors.successBg : colors.dangerBg
                }]}>
                  <Feather
                    name={isTransfer ? 'repeat' : tx.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}
                    size={16}
                    color={isTransfer ? colors.textMuted : tx.type === 'credit' ? colors.success : colors.danger}
                  />
                </View>
                <View style={styles.txDetails}>
                  <Text style={[styles.txDescription, { color: colors.text }]} numberOfLines={1}>{tx.description || tx.category}</Text>
                  <Text style={[styles.txMeta, { color: colors.textFaint }]}>
                    {formatDateDisplay(tx.date)} •{' '}
                    {isTransfer ? `${tx.bank} → ${tx.transfer_to}` : `${tx.category}${tx.bank ? ` • ${tx.bank}` : ''}`}
                    {tx.smsId ? ' • SMS' : ''}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: isTransfer ? colors.textMuted : tx.type === 'credit' ? colors.success : colors.danger }]}>
                  {isTransfer ? '' : tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                </Text>
                {!bulkMode && selectedTx?.id === tx.id && (
                  <View style={styles.txActions}>
                    <TouchableOpacity
                      style={[styles.txActionBtn, { backgroundColor: colors.primaryBg }]}
                      onPress={() => { setEditTx(tx); setSelectedTx(null); setModalVisible(true); }}
                    >
                      <Feather name="edit-2" size={15} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.txActionBtn, { backgroundColor: colors.dangerBg }]}
                      onPress={() => handleDelete(tx)}
                    >
                      <Feather name="trash-2" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <AddTransactionModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditTx(null); }}
        onSaved={loadData}
        editTransaction={editTx}
        paymentSources={paymentSources}
      />

      <Modal visible={bulkActionModal !== null} animationType="slide" transparent onRequestClose={() => setBulkActionModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBulkActionModal(null)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
              {bulkActionModal === 'category' ? `Set Category for ${selectedIds.size} transactions` : `Set Payment Source for ${selectedIds.size} transactions`}
            </Text>
            <ScrollView style={styles.bottomSheetList} showsVerticalScrollIndicator={false}>
              {bulkActionModal === 'category' && categories.map(cat => (
                <TouchableOpacity key={cat.id} style={[styles.bottomSheetItem, { backgroundColor: colors.cardAlt }]} onPress={() => handleBulkCategorySelect(cat.name)}>
                  <View style={[styles.catIconSmall, { backgroundColor: (cat.color || '#6B7280') + '22' }]}>
                    <Feather name={(cat.icon || 'more-horizontal') as any} size={16} color={cat.color || '#6B7280'} />
                  </View>
                  <Text style={[styles.bottomSheetItemText, { color: colors.text }]}>{cat.name}</Text>
                  <Feather name="chevron-right" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              ))}
              {bulkActionModal === 'source' && paymentSources.map(source => (
                <TouchableOpacity key={source} style={[styles.bottomSheetItem, { backgroundColor: colors.cardAlt }]} onPress={() => handleBulkSourceSelect(source)}>
                  <View style={[styles.catIconSmall, { backgroundColor: colors.primaryBg }]}>
                    <Feather name="credit-card" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.bottomSheetItemText, { color: colors.text }]}>{source}</Text>
                  <Feather name="chevron-right" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 15 },
  iconBtn: { padding: 10, borderRadius: 10, borderWidth: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterBtnText: { fontSize: 13, fontWeight: '500' },
  filterRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  countText: { fontSize: 11 },
  totalText: { fontSize: 13, fontWeight: '700' },
  bulkBar: { borderBottomWidth: 1, paddingTop: 8, paddingBottom: 4 },
  bulkBarTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 6, gap: 6 },
  bulkCount: { fontSize: 13, fontWeight: '700', flex: 1 },
  bulkSelectBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bulkSelectBtnText: { fontSize: 12, fontWeight: '600' },
  bulkCancelBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  bulkChipScroll: { flexGrow: 0 },
  bulkChipContent: { paddingHorizontal: 12, paddingBottom: 6, gap: 6, flexDirection: 'row' },
  bulkActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  bulkActionBtnText: { fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  txItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, borderWidth: 1.5, borderColor: 'transparent' },
  bulkCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  txIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txDetails: { flex: 1 },
  txDescription: { fontSize: 15, fontWeight: '600' },
  txMeta: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  txActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  txActionBtn: { padding: 8, borderRadius: 8 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: 12, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 32, maxHeight: '70%' },
  bottomSheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  bottomSheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  bottomSheetList: { paddingHorizontal: 12 },
  bottomSheetItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 6, gap: 12 },
  catIconSmall: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bottomSheetItemText: { flex: 1, fontSize: 15, fontWeight: '500' },
});

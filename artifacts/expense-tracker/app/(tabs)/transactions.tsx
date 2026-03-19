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

function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exportToCsv(transactions: Transaction[]): string {
  const header = 'Date,Type,Amount,Category,Description,Bank,Note,SMS Imported';
  const rows = transactions.map(tx =>
    [
      tx.date,
      tx.type,
      tx.amount.toFixed(2),
      `"${tx.category.replace(/"/g, '""')}"`,
      `"${tx.description.replace(/"/g, '""')}"`,
      `"${tx.bank.replace(/"/g, '""')}"`,
      `"${tx.note.replace(/"/g, '""')}"`,
      tx.smsId ? 'Yes' : 'No',
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export default function TransactionsScreen() {
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

  const handleSearch = (q: string) => {
    setSearch(q);
    applyFilter(transactions, q, filterType);
  };

  const handleFilterType = (type: typeof filterType) => {
    setFilterType(type);
    applyFilter(transactions, search, type);
  };

  const handleDelete = (tx: Transaction) => {
    Alert.alert(
      'Delete Transaction',
      `Delete ₹${tx.amount.toFixed(2)} ${tx.type} on ${tx.date}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTransaction(tx.id);
            setSelectedTx(null);
            loadData();
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    if (filtered.length === 0) {
      Alert.alert('Nothing to Export', 'No transactions match the current filter.');
      return;
    }
    const csv = exportToCsv(filtered);
    try {
      await Share.share({
        message: csv,
        title: 'Expense Tracker — Transactions Export',
      });
    } catch (err) {
      Alert.alert('Export Failed', 'Could not share the export.');
    }
  };

  const toggleBulkMode = () => {
    setBulkMode(prev => !prev);
    setSelectedIds(new Set());
    setSelectedTx(null);
  };

  const toggleBulkSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(t => t.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Delete Transactions',
      `Delete ${selectedIds.size} selected transaction${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            bulkDeleteTransactions([...selectedIds]);
            setSelectedIds(new Set());
            setBulkMode(false);
            loadData();
          },
        },
      ]
    );
  };

  const handleBulkCategorySelect = (category: string) => {
    bulkUpdateTransactionCategory([...selectedIds], category);
    setBulkActionModal(null);
    setSelectedIds(new Set());
    setBulkMode(false);
    loadData();
  };

  const handleBulkSourceSelect = (source: string) => {
    bulkUpdateTransactionBank([...selectedIds], source);
    setBulkActionModal(null);
    setSelectedIds(new Set());
    setBulkMode(false);
    loadData();
  };

  const totalShown = filtered.reduce((sum, tx) => sum + (tx.type === 'debit' ? -tx.amount : tx.amount), 0);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={handleSearch}
            placeholder="Search transactions..."
            placeholderTextColor="#9CA3AF"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Feather name="x" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Feather name="share" size={18} color="#6366F1" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, bulkMode && styles.exportBtnActive]}
          onPress={toggleBulkMode}
        >
          <Feather name="check-square" size={18} color={bulkMode ? '#FFFFFF' : '#6366F1'} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'debit', 'credit'] as const).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.filterBtn, filterType === type && styles.filterBtnActive]}
            onPress={() => handleFilterType(type)}
          >
            <Text style={[styles.filterBtnText, filterType === type && styles.filterBtnTextActive]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterRight}>
          <Text style={styles.countText}>{filtered.length} txns</Text>
          <Text style={[styles.totalText, { color: totalShown >= 0 ? '#10B981' : '#EF4444' }]}>
            {totalShown >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalShown))}
          </Text>
        </View>
      </View>

      {bulkMode && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity style={styles.bulkSelectBtn} onPress={selectAllFiltered}>
            <Text style={styles.bulkSelectBtnText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkSelectBtn} onPress={deselectAll}>
            <Text style={styles.bulkSelectBtnText}>None</Text>
          </TouchableOpacity>
          <View style={styles.bulkActions}>
            <TouchableOpacity
              style={[styles.bulkActionBtn, selectedIds.size === 0 && styles.bulkActionBtnDisabled]}
              onPress={() => selectedIds.size > 0 && setBulkActionModal('category')}
            >
              <Feather name="tag" size={14} color={selectedIds.size > 0 ? '#6366F1' : '#D1D5DB'} />
              <Text style={[styles.bulkActionBtnText, selectedIds.size === 0 && { color: '#D1D5DB' }]}>Category</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, selectedIds.size === 0 && styles.bulkActionBtnDisabled]}
              onPress={() => selectedIds.size > 0 && setBulkActionModal('source')}
            >
              <Feather name="credit-card" size={14} color={selectedIds.size > 0 ? '#10B981' : '#D1D5DB'} />
              <Text style={[styles.bulkActionBtnText, { color: selectedIds.size > 0 ? '#10B981' : '#D1D5DB' }]}>Source</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, styles.bulkDeleteBtn, selectedIds.size === 0 && styles.bulkActionBtnDisabled]}
              onPress={handleBulkDelete}
            >
              <Feather name="trash-2" size={14} color={selectedIds.size > 0 ? '#EF4444' : '#D1D5DB'} />
              <Text style={[styles.bulkActionBtnText, { color: selectedIds.size > 0 ? '#EF4444' : '#D1D5DB' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>No transactions found</Text>
          </View>
        ) : (
          filtered.map(tx => {
            const isBulkSelected = selectedIds.has(tx.id);
            return (
              <TouchableOpacity
                key={tx.id}
                style={[
                  styles.txItem,
                  !bulkMode && selectedTx?.id === tx.id && styles.txItemSelected,
                  bulkMode && isBulkSelected && styles.txItemBulkSelected,
                ]}
                onPress={() => {
                  if (bulkMode) {
                    toggleBulkSelect(tx.id);
                  } else {
                    setSelectedTx(selectedTx?.id === tx.id ? null : tx);
                  }
                }}
                activeOpacity={0.7}
              >
                {bulkMode && (
                  <View style={[styles.bulkCheckbox, isBulkSelected && styles.bulkCheckboxSelected]}>
                    {isBulkSelected && <Feather name="check" size={12} color="#FFFFFF" />}
                  </View>
                )}
                <View style={[styles.txIcon, { backgroundColor: tx.type === 'credit' ? '#D1FAE5' : '#FEE2E2' }]}>
                  <Feather
                    name={tx.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}
                    size={16}
                    color={tx.type === 'credit' ? '#10B981' : '#EF4444'}
                  />
                </View>
                <View style={styles.txDetails}>
                  <Text style={styles.txDescription} numberOfLines={1}>{tx.description || tx.category}</Text>
                  <Text style={styles.txMeta}>
                    {formatDateDisplay(tx.date)} • {tx.category}
                    {tx.bank ? ` • ${tx.bank}` : ''}
                    {tx.smsId ? ' • SMS' : ''}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: tx.type === 'credit' ? '#10B981' : '#EF4444' }]}>
                  {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                </Text>

                {!bulkMode && selectedTx?.id === tx.id && (
                  <View style={styles.txActions}>
                    <TouchableOpacity
                      style={styles.txActionBtn}
                      onPress={() => { setEditTx(tx); setSelectedTx(null); setModalVisible(true); }}
                    >
                      <Feather name="edit-2" size={15} color="#6366F1" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.txActionBtn, styles.txDeleteBtn]}
                      onPress={() => handleDelete(tx)}
                    >
                      <Feather name="trash-2" size={15} color="#EF4444" />
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

      <Modal
        visible={bulkActionModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setBulkActionModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBulkActionModal(null)}
        >
          <View style={styles.bottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.bottomSheetHandle} />
            <Text style={styles.bottomSheetTitle}>
              {bulkActionModal === 'category'
                ? `Set Category for ${selectedIds.size} transactions`
                : `Set Payment Source for ${selectedIds.size} transactions`}
            </Text>
            <ScrollView style={styles.bottomSheetList} showsVerticalScrollIndicator={false}>
              {bulkActionModal === 'category' &&
                categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.bottomSheetItem}
                    onPress={() => handleBulkCategorySelect(cat.name)}
                  >
                    <View style={[styles.catIconSmall, { backgroundColor: cat.color + '22' }]}>
                      <Feather name={cat.icon as any} size={16} color={cat.color} />
                    </View>
                    <Text style={styles.bottomSheetItemText}>{cat.name}</Text>
                    <Feather name="chevron-right" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))}
              {bulkActionModal === 'source' &&
                paymentSources.map(source => (
                  <TouchableOpacity
                    key={source}
                    style={styles.bottomSheetItem}
                    onPress={() => handleBulkSourceSelect(source)}
                  >
                    <View style={styles.sourceIconSmall}>
                      <Feather name="credit-card" size={16} color="#6366F1" />
                    </View>
                    <Text style={styles.bottomSheetItemText}>{source}</Text>
                    <Feather name="chevron-right" size={16} color="#D1D5DB" />
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  exportBtn: {
    backgroundColor: '#EEF2FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  exportBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterBtnActive: { backgroundColor: '#6366F1' },
  filterBtnText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  filterBtnTextActive: { color: '#FFFFFF' },
  filterRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  countText: { fontSize: 11, color: '#9CA3AF' },
  totalText: { fontSize: 13, fontWeight: '700' },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
    borderBottomWidth: 1,
    borderBottomColor: '#C7D2FE',
    gap: 6,
  },
  bulkCount: { fontSize: 13, fontWeight: '700', color: '#4338CA', minWidth: 70 },
  bulkSelectBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#C7D2FE',
  },
  bulkSelectBtnText: { fontSize: 12, fontWeight: '600', color: '#4338CA' },
  bulkActions: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  bulkActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  bulkActionBtnDisabled: { opacity: 0.5 },
  bulkDeleteBtn: {},
  bulkActionBtnText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  list: { flex: 1 },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  txItemSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  txItemBulkSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  bulkCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  bulkCheckboxSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  txIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txDetails: { flex: 1 },
  txDescription: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  txActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  txActionBtn: { backgroundColor: '#EEF2FF', padding: 8, borderRadius: 8 },
  txDeleteBtn: { backgroundColor: '#FEF2F2' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9CA3AF', marginTop: 12, fontSize: 15 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 32, maxHeight: '70%',
  },
  bottomSheetHandle: {
    width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 16, fontWeight: '700', color: '#111827',
    paddingHorizontal: 20, marginBottom: 12,
  },
  bottomSheetList: { paddingHorizontal: 12 },
  bottomSheetItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 6, gap: 12,
  },
  catIconSmall: {
    width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  sourceIconSmall: {
    width: 34, height: 34, borderRadius: 9, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomSheetItemText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#111827' },
});

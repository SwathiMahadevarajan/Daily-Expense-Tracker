import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Alert,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  Transaction,
  getTransactions,
  getMonthSummary,
  deleteTransaction,
  bulkDeleteTransactions,
  bulkUpdateTransactionCategory,
  bulkUpdateTransactionBank,
  getCategories,
  Category,
} from '../../lib/database';
import { getPaymentSources } from '../../lib/paymentSources';
import AddTransactionModal from '../../components/AddTransactionModal';
import SmsImportModal from '../../components/SmsImportModal';
import { useTheme } from '../../lib/theme';

function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthKey(offset: number = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    if (!groups[tx.date]) groups[tx.date] = [];
    groups[tx.date].push(tx);
  }
  return groups;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateStr === today.toISOString().slice(0, 10)) return 'Today';
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const [monthOffset, setMonthOffset] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [prevSummary, setPrevSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const [slideAnim] = useState(new Animated.Value(0));

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionModal, setBulkActionModal] = useState<'category' | 'source' | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const monthKey = getMonthKey(monthOffset);

  const loadData = useCallback(() => {
    const txs = getTransactions(monthKey);
    const sum = getMonthSummary(monthKey);
    const prevKey = getMonthKey(monthOffset - 1);
    const prev = getMonthSummary(prevKey);
    setTransactions(txs);
    setSummary(sum);
    setPrevSummary(prev);
    setCategories(getCategories());
    getPaymentSources().then(setPaymentSources);
  }, [monthKey, monthOffset]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const navigateMonth = (dir: number) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: dir * -30, duration: 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
    setMonthOffset(prev => prev + dir);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  };

  const handleDelete = (tx: Transaction) => {
    Alert.alert(
      'Delete Transaction',
      `Delete ₹${tx.amount.toFixed(2)} — ${tx.description || tx.category}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deleteTransaction(tx.id); loadData(); } },
      ]
    );
  };

  const enterBulkMode = (id: number) => {
    setBulkMode(true);
    setSelectedIds(new Set([id]));
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
  };

  const toggleBulkSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(transactions.map(t => t.id)));
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

  const net = summary.received - summary.spent;
  const spentChange = prevSummary.spent > 0 ? ((summary.spent - prevSummary.spent) / prevSummary.spent) * 100 : 0;
  const grouped = groupByDate(transactions);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.monthNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Animated.Text style={[styles.monthLabel, { color: colors.text, transform: [{ translateX: slideAnim }] }]}>
          {getMonthLabel(monthKey)}
        </Animated.Text>
        <TouchableOpacity
          onPress={() => navigateMonth(1)}
          style={[styles.navBtn, monthOffset >= 0 && { opacity: 0.3 }]}
          disabled={monthOffset >= 0}
        >
          <Feather name="chevron-right" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {bulkMode && (
        <View style={[styles.bulkBar, { backgroundColor: colors.primaryBg, borderBottomColor: colors.primaryBorder }]}>
          <View style={styles.bulkBarTop}>
            <Text style={[styles.bulkCount, { color: colors.primary }]}>{selectedIds.size} selected</Text>
            <TouchableOpacity style={[styles.bulkSelectBtn, { backgroundColor: colors.primaryBorder }]} onPress={selectAll}>
              <Text style={[styles.bulkSelectBtnText, { color: '#FFFFFF' }]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkSelectBtn, { backgroundColor: colors.primaryBorder }]} onPress={deselectAll}>
              <Text style={[styles.bulkSelectBtnText, { color: '#FFFFFF' }]}>None</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkCancelBtn, { backgroundColor: colors.card }]} onPress={exitBulkMode}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bulkChipScroll} contentContainerStyle={styles.bulkChipContent}>
            <TouchableOpacity
              style={[styles.bulkActionBtn, { backgroundColor: colors.card, borderColor: colors.primaryBorder, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              onPress={() => selectedIds.size > 0 && setBulkActionModal('category')}
            >
              <Feather name="tag" size={13} color={colors.primary} />
              <Text style={[styles.bulkActionBtnText, { color: colors.primary }]}>Category</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, { backgroundColor: colors.card, borderColor: colors.primaryBorder, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              onPress={() => selectedIds.size > 0 && setBulkActionModal('source')}
            >
              <Feather name="credit-card" size={13} color={colors.success} />
              <Text style={[styles.bulkActionBtnText, { color: colors.success }]}>Source</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, { backgroundColor: colors.card, borderColor: colors.dangerBg, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              onPress={handleBulkDelete}
            >
              <Feather name="trash-2" size={13} color={colors.danger} />
              <Text style={[styles.bulkActionBtnText, { color: colors.danger }]}>Delete</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textFaint }]}>Spent</Text>
              <Text style={[styles.summaryAmount, { color: colors.danger }]}>{formatCurrency(summary.spent)}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textFaint }]}>Received</Text>
              <Text style={[styles.summaryAmount, { color: colors.success }]}>{formatCurrency(summary.received)}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textFaint }]}>Net</Text>
              <Text style={[styles.summaryAmount, { color: net >= 0 ? colors.success : colors.danger }]}>
                {formatCurrency(Math.abs(net))}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.chipsRow}>
          <View style={[styles.chip, { backgroundColor: colors.card }]}>
            <Feather name="trending-up" size={12} color={colors.textMuted} />
            <Text style={[styles.chipLabel, { color: colors.textFaint }]}>Daily Avg</Text>
            <Text style={[styles.chipValue, { color: colors.textSub }]}>{formatCurrency(summary.count > 0 ? summary.spent / 30 : 0)}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.card }]}>
            <Feather name="list" size={12} color={colors.textMuted} />
            <Text style={[styles.chipLabel, { color: colors.textFaint }]}>Transactions</Text>
            <Text style={[styles.chipValue, { color: colors.textSub }]}>{summary.count}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.card }]}>
            <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={12} color={spentChange >= 0 ? colors.danger : colors.success} />
            <Text style={[styles.chipLabel, { color: colors.textFaint }]}>vs Last Month</Text>
            <Text style={[styles.chipValue, { color: spentChange >= 0 ? colors.danger : colors.success }]}>
              {spentChange >= 0 ? '+' : ''}{spentChange.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.smsImportBtn, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]} onPress={() => setSmsModalVisible(true)}>
            <Feather name="message-square" size={16} color={colors.primary} />
            <Text style={[styles.smsImportText, { color: colors.primary }]}>Import SMS</Text>
          </TouchableOpacity>
        </View>

        {sortedDates.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color={colors.textFaint} />
            <Text style={[styles.emptyTitle, { color: colors.textSub }]}>No transactions yet</Text>
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>Long-press any transaction to select, or tap + to add</Text>
          </View>
        ) : (
          sortedDates.map(date => (
            <View key={date} style={styles.dateGroup}>
              <View style={styles.dateHeader}>
                <Text style={[styles.dateLabel, { color: colors.textFaint }]}>{formatDate(date)}</Text>
                <Text style={[styles.dateTotalLabel, { color: colors.textSub }]}>
                  {formatCurrency(grouped[date].reduce((sum, tx) => sum + (tx.type === 'debit' ? -tx.amount : tx.amount), 0))}
                </Text>
              </View>
              {grouped[date].map(tx => {
                const isBulkSelected = selectedIds.has(tx.id);
                const isTransfer = !!(tx.transfer_to);
                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={[
                      styles.txItem,
                      { backgroundColor: colors.card },
                      isBulkSelected && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
                    ]}
                    onPress={() => {
                      if (bulkMode) {
                        toggleBulkSelect(tx.id);
                      } else {
                        setEditTx(tx);
                        setAddModalVisible(true);
                      }
                    }}
                    onLongPress={() => {
                      if (!bulkMode) {
                        enterBulkMode(tx.id);
                      }
                    }}
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
                      <Text style={[styles.txDescription, { color: colors.text }]} numberOfLines={1}>
                        {tx.description || tx.category}
                      </Text>
                      <Text style={[styles.txMeta, { color: colors.textFaint }]}>
                        {isTransfer ? `${tx.bank} → ${tx.transfer_to}` : `${tx.category}${tx.bank ? ` • ${tx.bank}` : ''}`}
                      </Text>
                    </View>
                    <Text style={[styles.txAmount, {
                      color: isTransfer ? colors.textMuted : tx.type === 'credit' ? colors.success : colors.danger
                    }]}>
                      {isTransfer ? '' : tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {!bulkMode && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => { setEditTx(null); setAddModalVisible(true); }}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <AddTransactionModal
        visible={addModalVisible}
        onClose={() => { setAddModalVisible(false); setEditTx(null); }}
        onSaved={loadData}
        editTransaction={editTx}
        paymentSources={paymentSources}
      />

      <SmsImportModal
        visible={smsModalVisible}
        onClose={() => setSmsModalVisible(false)}
        onImportComplete={() => { loadData(); setSmsModalVisible(false); }}
      />

      <Modal
        visible={bulkActionModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setBulkActionModal(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBulkActionModal(null)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>
              {bulkActionModal === 'category'
                ? `Set Category for ${selectedIds.size} transactions`
                : `Set Payment Source for ${selectedIds.size} transactions`}
            </Text>
            <ScrollView style={styles.bottomSheetList} showsVerticalScrollIndicator={false}>
              {bulkActionModal === 'category' && categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.bottomSheetItem, { backgroundColor: colors.cardAlt }]}
                  onPress={() => handleBulkCategorySelect(cat.name)}
                >
                  <View style={[styles.catIconSmall, { backgroundColor: (cat.color || '#6B7280') + '22' }]}>
                    <Feather name={(cat.icon || 'more-horizontal') as any} size={16} color={cat.color || '#6B7280'} />
                  </View>
                  <Text style={[styles.bottomSheetItemText, { color: colors.text }]}>{cat.name}</Text>
                  <Feather name="chevron-right" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              ))}
              {bulkActionModal === 'source' && paymentSources.map(source => (
                <TouchableOpacity
                  key={source}
                  style={[styles.bottomSheetItem, { backgroundColor: colors.cardAlt }]}
                  onPress={() => handleBulkSourceSelect(source)}
                >
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
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  navBtn: { padding: 8 },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  summaryCard: { margin: 16, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  summaryAmount: { fontSize: 16, fontWeight: '700' },
  summaryDivider: { width: 1, height: 40 },
  chipsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', gap: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  chipLabel: { fontSize: 10, fontWeight: '500' },
  chipValue: { fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4, gap: 8 },
  smsImportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 10, borderWidth: 1 },
  smsImportText: { fontSize: 14, fontWeight: '600' },
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
  bulkCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  dateGroup: { paddingHorizontal: 16, marginBottom: 8 },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  dateLabel: { fontSize: 13, fontWeight: '600' },
  dateTotalLabel: { fontSize: 13, fontWeight: '600' },
  txItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, borderWidth: 1.5, borderColor: 'transparent' },
  txIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txDetails: { flex: 1 },
  txDescription: { fontSize: 15, fontWeight: '600' },
  txMeta: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 32, maxHeight: '70%' },
  bottomSheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  bottomSheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  bottomSheetList: { paddingHorizontal: 12 },
  bottomSheetItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 6, gap: 12 },
  catIconSmall: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bottomSheetItemText: { flex: 1, fontSize: 15, fontWeight: '500' },
});

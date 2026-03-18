import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Transaction, getTransactions, getMonthSummary, deleteTransaction } from '../../lib/database';
import { getPaymentSources } from '../../lib/paymentSources';
import AddTransactionModal from '../../components/AddTransactionModal';
import SmsImportModal from '../../components/SmsImportModal';

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
  const [monthOffset, setMonthOffset] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [prevSummary, setPrevSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const slideAnim = useState(new Animated.Value(0))[0];

  const monthKey = getMonthKey(monthOffset);

  const loadData = useCallback(() => {
    const txs = getTransactions(monthKey);
    const sum = getMonthSummary(monthKey);
    const prevKey = getMonthKey(monthOffset - 1);
    const prev = getMonthSummary(prevKey);
    setTransactions(txs);
    setSummary(sum);
    setPrevSummary(prev);
  }, [monthKey, monthOffset]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    getPaymentSources().then(setPaymentSources);
  }, []);

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
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => { deleteTransaction(tx.id); loadData(); },
        },
      ]
    );
  };

  const net = summary.received - summary.spent;
  const dailyAvg = summary.count > 0 ? summary.spent / new Date(monthKey + '-01').toISOString().slice(0, 10).split('-')[2].length : 0;
  const spentChange = prevSummary.spent > 0 ? ((summary.spent - prevSummary.spent) / prevSummary.spent) * 100 : 0;

  const grouped = groupByDate(transactions);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color="#6366F1" />
        </TouchableOpacity>
        <Animated.Text style={[styles.monthLabel, { transform: [{ translateX: slideAnim }] }]}>
          {getMonthLabel(monthKey)}
        </Animated.Text>
        <TouchableOpacity
          onPress={() => navigateMonth(1)}
          style={[styles.navBtn, monthOffset >= 0 && styles.navBtnDisabled]}
          disabled={monthOffset >= 0}
        >
          <Feather name="chevron-right" size={22} color={monthOffset >= 0 ? '#D1D5DB' : '#6366F1'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Spent</Text>
              <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>{formatCurrency(summary.spent)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Received</Text>
              <Text style={[styles.summaryAmount, { color: '#10B981' }]}>{formatCurrency(summary.received)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Net</Text>
              <Text style={[styles.summaryAmount, { color: net >= 0 ? '#10B981' : '#EF4444' }]}>
                {formatCurrency(Math.abs(net))}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <Feather name="trending-up" size={12} color="#6B7280" />
            <Text style={styles.chipLabel}>Daily Avg</Text>
            <Text style={styles.chipValue}>{formatCurrency(summary.count > 0 ? summary.spent / 30 : 0)}</Text>
          </View>
          <View style={styles.chip}>
            <Feather name="list" size={12} color="#6B7280" />
            <Text style={styles.chipLabel}>Transactions</Text>
            <Text style={styles.chipValue}>{summary.count}</Text>
          </View>
          <View style={styles.chip}>
            <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={12} color={spentChange >= 0 ? '#EF4444' : '#10B981'} />
            <Text style={styles.chipLabel}>vs Last Month</Text>
            <Text style={[styles.chipValue, { color: spentChange >= 0 ? '#EF4444' : '#10B981' }]}>
              {spentChange >= 0 ? '+' : ''}{spentChange.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={styles.smsImportRow}>
          <TouchableOpacity style={styles.smsImportBtn} onPress={() => setSmsModalVisible(true)}>
            <Feather name="message-square" size={16} color="#6366F1" />
            <Text style={styles.smsImportText}>Import SMS</Text>
          </TouchableOpacity>
        </View>

        {sortedDates.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>Tap + to add your first transaction or import from SMS</Text>
          </View>
        ) : (
          sortedDates.map(date => (
            <View key={date} style={styles.dateGroup}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateLabel}>{formatDate(date)}</Text>
                <Text style={styles.dateTotalLabel}>
                  {formatCurrency(
                    grouped[date].reduce((sum, tx) => sum + (tx.type === 'debit' ? -tx.amount : tx.amount), 0)
                  )}
                </Text>
              </View>
              {grouped[date].map(tx => (
                <TouchableOpacity
                  key={tx.id}
                  style={styles.txItem}
                  onPress={() => { setEditTx(tx); setAddModalVisible(true); }}
                  onLongPress={() => handleDelete(tx)}
                >
                  <View style={[styles.txIcon, { backgroundColor: tx.type === 'credit' ? '#D1FAE5' : '#FEE2E2' }]}>
                    <Feather
                      name={tx.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}
                      size={16}
                      color={tx.type === 'credit' ? '#10B981' : '#EF4444'}
                    />
                  </View>
                  <View style={styles.txDetails}>
                    <Text style={styles.txDescription} numberOfLines={1}>
                      {tx.description || tx.category}
                    </Text>
                    <Text style={styles.txMeta}>{tx.category}{tx.bank ? ` • ${tx.bank}` : ''}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.type === 'credit' ? '#10B981' : '#EF4444' }]}>
                    {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => { setEditTx(null); setAddModalVisible(true); }}
      >
        <Feather name="plus" size={28} color="#FFFFFF" />
      </TouchableOpacity>

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
        onImportComplete={(count) => {
          loadData();
          setSmsModalVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  navBtn: { padding: 8 },
  navBtnDisabled: { opacity: 0.3 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#111827' },
  scroll: { flex: 1 },
  summaryCard: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginBottom: 4 },
  summaryAmount: { fontSize: 16, fontWeight: '700' },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#E5E7EB' },
  chipsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  chipLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  chipValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  smsImportRow: { paddingHorizontal: 16, marginBottom: 16 },
  smsImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  smsImportText: { fontSize: 14, fontWeight: '600', color: '#6366F1' },
  dateGroup: { paddingHorizontal: 16, marginBottom: 8 },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dateLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  dateTotalLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  txItem: {
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
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txDetails: { flex: 1 },
  txDescription: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});

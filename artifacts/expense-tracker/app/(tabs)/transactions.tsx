import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Transaction, getTransactions, deleteTransaction } from '../../lib/database';
import { getPaymentSources } from '../../lib/paymentSources';
import AddTransactionModal from '../../components/AddTransactionModal';

function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filtered, setFiltered] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debit' | 'credit'>('all');
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);

  const loadData = useCallback(() => {
    const txs = getTransactions();
    setTransactions(txs);
    applyFilter(txs, search, filterType);
    getPaymentSources().then(setPaymentSources);
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
    Alert.alert('Delete Transaction', `Delete this ₹${tx.amount} transaction?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(tx.id);
          loadData();
        },
      },
    ]);
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
        <Text style={styles.totalShown}>
          Net: <Text style={{ color: totalShown >= 0 ? '#10B981' : '#EF4444' }}>{formatCurrency(Math.abs(totalShown))}</Text>
        </Text>
      </View>

      <ScrollView style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>No transactions found</Text>
          </View>
        ) : (
          filtered.map(tx => (
            <TouchableOpacity
              key={tx.id}
              style={styles.txItem}
              onPress={() => { setEditTx(tx); setModalVisible(true); }}
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
                <Text style={styles.txDescription} numberOfLines={1}>{tx.description || tx.category}</Text>
                <Text style={styles.txMeta}>{tx.date} • {tx.category}{tx.bank ? ` • ${tx.bank}` : ''}</Text>
              </View>
              <Text style={[styles.txAmount, { color: tx.type === 'credit' ? '#10B981' : '#EF4444' }]}>
                {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
              </Text>
            </TouchableOpacity>
          ))
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  searchRow: { padding: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
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
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterBtnActive: { backgroundColor: '#6366F1' },
  filterBtnText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  filterBtnTextActive: { color: '#FFFFFF' },
  totalShown: { marginLeft: 'auto', fontSize: 13, color: '#6B7280' },
  list: { flex: 1 },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
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
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9CA3AF', marginTop: 12, fontSize: 15 },
});

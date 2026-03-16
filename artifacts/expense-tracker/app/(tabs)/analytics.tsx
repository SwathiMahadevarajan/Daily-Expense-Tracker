import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getMonthSummary, getCategoryBreakdown, getCategories } from '../../lib/database';

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AnalyticsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [prevSummary, setPrevSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [breakdown, setBreakdown] = useState<{ category: string; total: number; count: number }[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});

  const monthKey = getMonthKey(year, month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevKey = getMonthKey(prevYear, prevMonth);

  const loadData = useCallback(() => {
    const s = getMonthSummary(monthKey);
    const p = getMonthSummary(prevKey);
    const cats = getCategories();
    const colors: Record<string, string> = {};
    cats.forEach(c => { colors[c.name] = c.color; });
    setSummary(s);
    setPrevSummary(p);
    setBreakdown(getCategoryBreakdown(monthKey));
    setCategoryColors(colors);
  }, [monthKey, prevKey]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const spentChange = prevSummary.spent > 0 ? ((summary.spent - prevSummary.spent) / prevSummary.spent) * 100 : 0;
  const maxBreakdown = breakdown.length > 0 ? breakdown[0].total : 1;

  const navigateMonth = (dir: number) => {
    let newMonth = month + dir;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setMonth(newMonth);
    setYear(newYear);
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color="#6366F1" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => navigateMonth(1)}
          style={styles.navBtn}
          disabled={monthKey >= getMonthKey(now.getFullYear(), now.getMonth() + 1)}
        >
          <Feather name="chevron-right" size={22} color={monthKey >= getMonthKey(now.getFullYear(), now.getMonth() + 1) ? '#D1D5DB' : '#6366F1'} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.comparisonCard}>
          <Text style={styles.cardTitle}>Month-over-Month</Text>
          <View style={styles.compRow}>
            <View style={styles.compItem}>
              <Text style={styles.compLabel}>This Month</Text>
              <Text style={[styles.compAmount, { color: '#EF4444' }]}>{formatCurrency(summary.spent)}</Text>
              <Text style={styles.compSub}>{summary.count} txns</Text>
            </View>
            <View style={styles.compArrow}>
              <Feather
                name={spentChange >= 0 ? 'trending-up' : 'trending-down'}
                size={24}
                color={spentChange >= 0 ? '#EF4444' : '#10B981'}
              />
              <Text style={[styles.changeText, { color: spentChange >= 0 ? '#EF4444' : '#10B981' }]}>
                {spentChange >= 0 ? '+' : ''}{spentChange.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.compItem}>
              <Text style={styles.compLabel}>Last Month</Text>
              <Text style={[styles.compAmount, { color: '#6B7280' }]}>{formatCurrency(prevSummary.spent)}</Text>
              <Text style={styles.compSub}>{prevSummary.count} txns</Text>
            </View>
          </View>
        </View>

        <View style={styles.insightsCard}>
          <Text style={styles.cardTitle}>Spending by Category</Text>
          {breakdown.length === 0 ? (
            <Text style={styles.emptyText}>No spending data for this month</Text>
          ) : (
            breakdown.map(item => (
              <View key={item.category} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <View style={[styles.categoryDot, { backgroundColor: categoryColors[item.category] || '#6B7280' }]} />
                  <Text style={styles.categoryName}>{item.category}</Text>
                  <Text style={styles.categoryCount}>{item.count} txns</Text>
                </View>
                <Text style={styles.categoryAmount}>{formatCurrency(item.total)}</Text>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${(item.total / maxBreakdown) * 100}%`,
                        backgroundColor: categoryColors[item.category] || '#6366F1',
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Feather name="arrow-up" size={20} color="#EF4444" />
              <Text style={styles.summaryLabel}>Total Spent</Text>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{formatCurrency(summary.spent)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Feather name="arrow-down" size={20} color="#10B981" />
              <Text style={styles.summaryLabel}>Total Received</Text>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(summary.received)}</Text>
            </View>
          </View>
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Net Balance</Text>
            <Text style={[styles.netValue, { color: summary.received - summary.spent >= 0 ? '#10B981' : '#EF4444' }]}>
              {formatCurrency(Math.abs(summary.received - summary.spent))}
              {summary.received - summary.spent >= 0 ? ' surplus' : ' deficit'}
            </Text>
          </View>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
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
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#111827' },
  scroll: { flex: 1 },
  comparisonCard: {
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
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 16 },
  compRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compItem: { flex: 1, alignItems: 'center' },
  compLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  compAmount: { fontSize: 18, fontWeight: '700' },
  compSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  compArrow: { alignItems: 'center', paddingHorizontal: 8 },
  changeText: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  insightsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryRow: { marginBottom: 16 },
  categoryInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  categoryDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  categoryName: { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1 },
  categoryCount: { fontSize: 12, color: '#9CA3AF' },
  categoryAmount: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  barBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  emptyText: { color: '#9CA3AF', textAlign: 'center', paddingVertical: 16 },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryItem: { flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12 },
  summaryLabel: { fontSize: 12, color: '#9CA3AF', marginVertical: 4 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  netLabel: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  netValue: { fontSize: 16, fontWeight: '700' },
});

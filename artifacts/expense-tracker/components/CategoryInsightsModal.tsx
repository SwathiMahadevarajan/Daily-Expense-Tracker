import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import {
  getCategoryMonthlyTrend,
  getCategoryTopMerchants,
  CategoryTrendPoint,
  CategoryMerchant,
} from '../lib/database';

interface Props {
  category: string | null;
  categoryColor: string;
  onClose: () => void;
}

function fmtMoney(n: number, compact = false): string {
  if (compact) {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  }
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CategoryInsightsModal({ category, categoryColor, onClose }: Props) {
  const { colors } = useTheme();
  const [trend, setTrend] = useState<CategoryTrendPoint[]>([]);
  const [merchants, setMerchants] = useState<CategoryMerchant[]>([]);

  useEffect(() => {
    if (!category) return;
    setTrend(getCategoryMonthlyTrend(category, 6));
    setMerchants(getCategoryTopMerchants(category, 3));
  }, [category]);

  if (!category) return null;

  const activeMonths = trend.filter(t => t.total > 0);
  const avgMonthly = activeMonths.length > 0
    ? activeMonths.reduce((s, t) => s + t.total, 0) / activeMonths.length
    : 0;
  const thisMonthTotal = trend[trend.length - 1]?.total ?? 0;
  const lastMonthTotal = trend[trend.length - 2]?.total ?? 0;
  const vsLastMonth = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : null;
  const maxTotal = Math.max(...trend.map(t => t.total), 1);
  const totalTxns = trend.reduce((s, t) => s + t.count, 0);
  const highestMonth = trend.reduce(
    (a, b) => b.total > a.total ? b : a,
    trend[0] ?? { total: 0, label: '—', month: '', count: 0 }
  );

  return (
    <Modal
      visible={!!category}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.card }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[styles.catDot, { backgroundColor: categoryColor }]} />
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>{category}</Text>
            <Text style={[styles.subtitle, { color: colors.textFaint }]}>6-month category insights</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color={colors.textSub} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Stats Grid */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Summary</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.cardAlt }]}>
                <Text style={[styles.statValue, { color: colors.danger }]}>{fmtMoney(thisMonthTotal, true)}</Text>
                <Text style={[styles.statLabel, { color: colors.textFaint }]}>This Month</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.cardAlt }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{fmtMoney(avgMonthly, true)}</Text>
                <Text style={[styles.statLabel, { color: colors.textFaint }]}>Avg / Month</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.cardAlt }]}>
                {vsLastMonth !== null ? (
                  <>
                    <View style={styles.changeRow}>
                      <Feather
                        name={vsLastMonth >= 0 ? 'trending-up' : 'trending-down'}
                        size={13}
                        color={vsLastMonth >= 0 ? colors.danger : colors.success}
                      />
                      <Text style={[styles.statValue, { color: vsLastMonth >= 0 ? colors.danger : colors.success }]}>
                        {vsLastMonth >= 0 ? '+' : ''}{vsLastMonth.toFixed(0)}%
                      </Text>
                    </View>
                    <Text style={[styles.statLabel, { color: colors.textFaint }]}>vs Last Month</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.statValue, { color: colors.textFaint }]}>—</Text>
                    <Text style={[styles.statLabel, { color: colors.textFaint }]}>vs Last Month</Text>
                  </>
                )}
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.cardAlt }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{totalTxns}</Text>
                <Text style={[styles.statLabel, { color: colors.textFaint }]}>Txns (6mo)</Text>
              </View>
            </View>
            {highestMonth.total > 0 && (
              <View style={[styles.peakBox, { backgroundColor: colors.warningBg }]}>
                <Feather name="zap" size={13} color={colors.warningText} />
                <Text style={[styles.peakText, { color: colors.warningText }]}>
                  Peak spend: {fmtMoney(highestMonth.total)} in {highestMonth.label}
                </Text>
              </View>
            )}
          </View>

          {/* Monthly Bar Chart */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Monthly Spend</Text>
            <View style={styles.chart}>
              {trend.map((point) => {
                const barH = maxTotal > 0
                  ? Math.max((point.total / maxTotal) * 100, point.total > 0 ? 5 : 0)
                  : 0;
                const isLatest = point.month === trend[trend.length - 1]?.month;
                return (
                  <View key={point.month} style={styles.chartCol}>
                    <Text style={[styles.chartAmt, { color: isLatest ? colors.text : colors.textFaint }]}>
                      {point.total > 0 ? fmtMoney(point.total, true) : ''}
                    </Text>
                    <View style={[styles.chartBarBg, { backgroundColor: colors.cardAlt }]}>
                      <View
                        style={[
                          styles.chartBarFill,
                          {
                            height: `${barH}%`,
                            backgroundColor: categoryColor,
                            opacity: isLatest ? 1 : 0.4,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.chartLabel,
                        {
                          color: isLatest ? colors.text : colors.textFaint,
                          fontWeight: isLatest ? '700' : '400',
                        },
                      ]}
                    >
                      {point.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Month-by-month Table */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Month Breakdown</Text>
            {[...trend].reverse().map((point, idx, arr) => {
              const prevPt = arr[idx + 1];
              const change = prevPt && prevPt.total > 0
                ? ((point.total - prevPt.total) / prevPt.total) * 100
                : null;
              const isLatest = idx === 0;
              return (
                <View
                  key={point.month}
                  style={[
                    styles.tableRow,
                    idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    isLatest && { backgroundColor: colors.cardAlt, borderRadius: 10, paddingHorizontal: 8 },
                  ]}
                >
                  <Text style={[styles.tableMonth, { color: isLatest ? colors.text : colors.textSub, fontWeight: isLatest ? '700' : '500' }]}>
                    {point.label}
                  </Text>
                  <Text style={[styles.tableCount, { color: colors.textFaint }]}>
                    {point.count > 0 ? `${point.count} txns` : '—'}
                  </Text>
                  <Text style={[styles.tableAmt, { color: point.total > 0 ? colors.danger : colors.textFaint }]}>
                    {point.total > 0 ? fmtMoney(point.total) : '—'}
                  </Text>
                  {change !== null ? (
                    <View style={styles.tableChange}>
                      <Feather
                        name={change >= 0 ? 'arrow-up' : 'arrow-down'}
                        size={11}
                        color={change >= 0 ? colors.danger : colors.success}
                      />
                      <Text style={[styles.tableChangeTxt, { color: change >= 0 ? colors.danger : colors.success }]}>
                        {Math.abs(change).toFixed(0)}%
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.tableChange} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Top Merchants */}
          {merchants.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Frequent Merchants</Text>
              <Text style={[styles.cardSub, { color: colors.textFaint }]}>Top descriptions in last 3 months</Text>
              {merchants.map((m, idx) => (
                <View
                  key={m.description}
                  style={[
                    styles.merchantRow,
                    idx < merchants.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.merchantRank, { backgroundColor: idx === 0 ? colors.primaryBg : colors.cardAlt }]}>
                    <Text style={[styles.merchantRankTxt, { color: idx === 0 ? colors.primary : colors.textMuted }]}>
                      #{idx + 1}
                    </Text>
                  </View>
                  <View style={styles.merchantInfo}>
                    <Text style={[styles.merchantName, { color: colors.text }]} numberOfLines={1}>
                      {m.description}
                    </Text>
                    <Text style={[styles.merchantMeta, { color: colors.textFaint }]}>
                      {m.count} transaction{m.count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.merchantAmt, { color: colors.danger }]}>
                    {fmtMoney(m.total, true)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
    zIndex: 10,
    elevation: 3,
  },
  catDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  content: { paddingBottom: 16 },
  card: {
    borderRadius: 16,
    margin: 12,
    marginBottom: 0,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  cardSub: { fontSize: 12, marginTop: -8, marginBottom: 12 },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, textAlign: 'center' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  peakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  peakText: { fontSize: 13, fontWeight: '600' },
  // Chart
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 130,
    gap: 4,
  },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  chartAmt: { fontSize: 9, textAlign: 'center', height: 14 },
  chartBarBg: { width: '80%', flex: 1, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  chartBarFill: { width: '100%', borderRadius: 4 },
  chartLabel: { fontSize: 10, textAlign: 'center' },
  // Table
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 8,
  },
  tableMonth: { width: 52, fontSize: 13 },
  tableCount: { flex: 1, fontSize: 12 },
  tableAmt: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  tableChange: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 42, justifyContent: 'flex-end' },
  tableChangeTxt: { fontSize: 11, fontWeight: '600' },
  // Merchants
  merchantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  merchantRank: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  merchantRankTxt: { fontSize: 11, fontWeight: '700' },
  merchantInfo: { flex: 1 },
  merchantName: { fontSize: 14, fontWeight: '600' },
  merchantMeta: { fontSize: 11, marginTop: 2 },
  merchantAmt: { fontSize: 14, fontWeight: '700' },
});

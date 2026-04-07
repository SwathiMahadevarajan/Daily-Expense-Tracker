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
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMonthSummary,
  getCategoryBreakdown,
  getCategoryTransactions,
  getCategories,
  getMonthlyTrend,
  getTopTransactions,
  getDayOfWeekStats,
  getSourceTransactionBalance,
  MonthlyTrendPoint,
  TopTransaction,
  DayOfWeekStat,
  Transaction,
} from '../../lib/database';
import { getPaymentSources } from '../../lib/paymentSources';
import { useTheme } from '../../lib/theme';
import CategoryInsightsModal from '../../components/CategoryInsightsModal';

function fmtMoney(n: number, compact = false): string {
  if (compact) {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  }
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getBudgetKey(monthKey: string) { return `budget_${monthKey}`; }
function getOpeningBalanceKey(source: string) { return `source_ob_${source}`; }

type Tab = 'month' | 'insights';

interface SourceBalanceInfo {
  source: string;
  currentBalance: number;
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<Tab>('month');
  const [budget, setBudget] = useState<number | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [sourceBalances, setSourceBalances] = useState<SourceBalanceInfo[]>([]);
  const [summary, setSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [prevSummary, setPrevSummary] = useState({ spent: 0, received: 0, count: 0 });
  const [breakdown, setBreakdown] = useState<{ category: string; total: number; count: number }[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);
  const [topExpenses, setTopExpenses] = useState<TopTransaction[]>([]);
  const [dayStats, setDayStats] = useState<DayOfWeekStat[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryTxns, setCategoryTxns] = useState<Transaction[]>([]);
  const [insightsCategory, setInsightsCategory] = useState<string | null>(null);
  const [insightsCategoryColor, setInsightsCategoryColor] = useState('#6366F1');

  const monthKey = getMonthKey(year, month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevKey = getMonthKey(prevYear, prevMonth);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const currentMonthKey = getMonthKey(now.getFullYear(), now.getMonth() + 1);

  const loadData = useCallback(async () => {
    const s = getMonthSummary(monthKey);
    const p = getMonthSummary(prevKey);
    const cats = getCategories();
    const catColors: Record<string, string> = {};
    cats.forEach(c => { catColors[c.name] = c.color; });
    setSummary(s);
    setPrevSummary(p);
    setBreakdown(getCategoryBreakdown(monthKey));
    setCategoryColors(catColors);
    setTrend(getMonthlyTrend(6));
    setTopExpenses(getTopTransactions(monthKey, 5, 'debit'));
    setDayStats(getDayOfWeekStats(monthKey));
    try {
      const stored = await AsyncStorage.getItem(getBudgetKey(monthKey));
      setBudget(stored ? parseFloat(stored) : null);
    } catch { setBudget(null); }
    try {
      const sources = await getPaymentSources();
      const balInfos: SourceBalanceInfo[] = [];
      for (const source of sources) {
        const obStr = await AsyncStorage.getItem(getOpeningBalanceKey(source));
        const openingBalance = obStr ? parseFloat(obStr) : 0;
        const txBal = getSourceTransactionBalance(source);
        balInfos.push({
          source,
          currentBalance: openingBalance + txBal.credits - txBal.debits + txBal.transferIn - txBal.transferOut,
        });
      }
      setSourceBalances(balInfos);
    } catch {}
  }, [monthKey, prevKey]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleShareSummary = async () => {
    const net = summary.received - summary.spent;
    const topCat = breakdown[0]?.category ?? 'N/A';
    const lines = [
      `📊 ${monthLabel} Summary`,
      `━━━━━━━━━━━━━━━━`,
      `💸 Spent:    ₹${summary.spent.toLocaleString('en-IN')}`,
      `💰 Received: ₹${summary.received.toLocaleString('en-IN')}`,
      `📈 Net:      ${net >= 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}`,
      budget ? `🎯 Budget:   ₹${budget.toLocaleString('en-IN')} (${budgetPct.toFixed(0)}% used)` : null,
      `🏆 Top Category: ${topCat}`,
      `📋 Transactions: ${summary.count}`,
      `━━━━━━━━━━━━━━━━`,
      `via Expense Tracker`,
    ].filter(Boolean).join('\n');
    try { await Share.share({ message: lines }); } catch {}
  };

  const navigateMonth = (dir: number) => {
    let m = month + dir; let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  const saveBudget = async () => {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) { Alert.alert('Invalid', 'Please enter a valid budget amount.'); return; }
    await AsyncStorage.setItem(getBudgetKey(monthKey), val.toString());
    setBudget(val); setEditingBudget(false); setBudgetInput('');
  };

  const clearBudget = async () => {
    await AsyncStorage.removeItem(getBudgetKey(monthKey));
    setBudget(null); setEditingBudget(false);
  };

  const spentChange = prevSummary.spent > 0 ? ((summary.spent - prevSummary.spent) / prevSummary.spent) * 100 : 0;
  const savingsRate = summary.received > 0 ? ((summary.received - summary.spent) / summary.received) * 100 : 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = monthKey === currentMonthKey ? now.getDate() : daysInMonth;
  const dailyAvg = dayOfMonth > 0 ? summary.spent / dayOfMonth : 0;
  const projectedSpend = dailyAvg * daysInMonth;
  const budgetPct = budget && budget > 0 ? Math.min((summary.spent / budget) * 100, 100) : 0;
  const budgetRemaining = budget ? budget - summary.spent : 0;
  const maxBreakdown = breakdown.length > 0 ? breakdown[0].total : 1;
  const maxTrend = Math.max(...trend.map(t => Math.max(t.spent, t.received)), 1);
  const maxDayTotal = Math.max(...dayStats.map(d => d.total), 1);
  const busiestDay = dayStats.reduce((a, b) => b.total > a.total ? b : a, dayStats[0] ?? { day: '', total: 0, shortDay: '', count: 0 });
  const totalBalance = sourceBalances.reduce((s, b) => s + b.currentBalance, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.monthNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.navBtn} disabled={monthKey >= currentMonthKey}>
          <Feather name="chevron-right" size={22} color={monthKey >= currentMonthKey ? colors.textFaint : colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShareSummary} style={[styles.navBtn, { marginLeft: 4 }]}>
          <Feather name="share-2" size={18} color={colors.textSub} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([['month', 'This Month'], ['insights', 'Insights']] as [Tab, string][]).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, { color: activeTab === key ? colors.primary : colors.textFaint }, activeTab === key && { fontWeight: '700' }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {activeTab === 'month' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.kpiRow}>
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.textFaint }]}>Spent</Text>
                  <Text style={[styles.kpiValue, { color: colors.danger }]}>{fmtMoney(summary.spent)}</Text>
                  <View style={[styles.changePill, { backgroundColor: spentChange >= 0 ? colors.dangerBg : colors.successBg }]}>
                    <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={10} color={spentChange >= 0 ? colors.danger : colors.success} />
                    <Text style={[styles.changeText, { color: spentChange >= 0 ? colors.danger : colors.success }]}>
                      {Math.abs(spentChange).toFixed(1)}% vs last month
                    </Text>
                  </View>
                </View>
                <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.textFaint }]}>Received</Text>
                  <Text style={[styles.kpiValue, { color: colors.success }]}>{fmtMoney(summary.received)}</Text>
                  <Text style={[styles.kpiSub, { color: colors.textFaint }]}>
                    {savingsRate.toFixed(0)}% saved · {summary.count} txns
                  </Text>
                </View>
              </View>
            </View>

            {sourceBalances.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Account Balances</Text>
                  <Text style={[styles.cardTitleRight, { color: totalBalance >= 0 ? colors.success : colors.danger }]}>
                    Total {fmtMoney(Math.abs(totalBalance))}
                  </Text>
                </View>
                <Text style={[styles.cardSub, { color: colors.textFaint }]}>All-time balance per account. Set opening balances in Settings.</Text>
                {sourceBalances.map((sb, idx) => (
                  <View key={sb.source} style={[styles.balRow, idx < sourceBalances.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View style={[styles.balIcon, { backgroundColor: sb.currentBalance >= 0 ? colors.successBg : colors.dangerBg }]}>
                      <Feather name="credit-card" size={14} color={sb.currentBalance >= 0 ? colors.success : colors.danger} />
                    </View>
                    <Text style={[styles.balSource, { color: colors.text }]}>{sb.source}</Text>
                    <Text style={[styles.balAmount, { color: sb.currentBalance >= 0 ? colors.success : colors.danger }]}>
                      {sb.currentBalance < 0 ? '-' : ''}{fmtMoney(Math.abs(sb.currentBalance))}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Monthly Budget</Text>
                <TouchableOpacity
                  style={[styles.editBtn, { backgroundColor: colors.primaryBg }]}
                  onPress={() => { setEditingBudget(!editingBudget); setBudgetInput(budget ? budget.toString() : ''); }}
                >
                  <Feather name={editingBudget ? 'x' : 'edit-2'} size={13} color={colors.primary} />
                  <Text style={[styles.editBtnText, { color: colors.primary }]}>{editingBudget ? 'Cancel' : budget ? 'Edit' : 'Set'}</Text>
                </TouchableOpacity>
              </View>
              {editingBudget ? (
                <View style={styles.budgetInputRow}>
                  <Text style={[styles.rupee, { color: colors.textFaint }]}>₹</Text>
                  <TextInput style={[styles.budgetInput, { backgroundColor: colors.inputBg, color: colors.inputText }]} value={budgetInput} onChangeText={setBudgetInput} keyboardType="numeric" placeholder="Enter monthly budget" placeholderTextColor={colors.placeholder} autoFocus />
                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveBudget}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
                  {budget !== null && <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.dangerBg }]} onPress={clearBudget}><Text style={[styles.saveBtnText, { color: colors.danger }]}>Clear</Text></TouchableOpacity>}
                </View>
              ) : budget !== null ? (
                <>
                  <View style={styles.budgetAmounts}>
                    <Text style={[styles.budgetSpent, { color: budgetPct >= 90 ? colors.danger : budgetPct >= 70 ? colors.warning : colors.text }]}>{fmtMoney(summary.spent)}</Text>
                    <Text style={[styles.budgetOf, { color: colors.textFaint }]}>of {fmtMoney(budget)}</Text>
                    <Text style={[styles.budgetRem, { color: budgetRemaining >= 0 ? colors.success : colors.danger }]}>
                      {budgetRemaining >= 0 ? fmtMoney(budgetRemaining) + ' left' : fmtMoney(Math.abs(budgetRemaining)) + ' over'}
                    </Text>
                  </View>
                  <View style={[styles.barBg, { backgroundColor: colors.cardAlt }]}>
                    <View style={[styles.barFill, { width: `${budgetPct}%`, backgroundColor: budgetPct >= 90 ? colors.danger : budgetPct >= 70 ? colors.warning : colors.success }]} />
                  </View>
                  <Text style={[styles.barPct, { color: colors.textFaint }]}>{budgetPct.toFixed(0)}% used · Daily avg {fmtMoney(dailyAvg, true)}</Text>
                  {monthKey === currentMonthKey && projectedSpend > 0 && (
                    <View style={[styles.projBox, { backgroundColor: projectedSpend > budget ? colors.dangerBg : colors.successBg }]}>
                      <Feather name="activity" size={12} color={projectedSpend > budget ? colors.danger : colors.success} />
                      <Text style={[styles.projText, { color: projectedSpend > budget ? colors.dangerText : colors.successText }]}>
                        Projected: {fmtMoney(projectedSpend, true)}{projectedSpend > budget ? ' — over budget!' : ' — on track'}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.budgetEmpty}>
                  <Text style={[styles.budgetEmptyText, { color: colors.textFaint }]}>No budget set · Tap "Set" to add a spending goal</Text>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Spending by Category</Text>
              <Text style={[styles.cardSub, { color: colors.textFaint }]}>Tap row for transactions · chart icon for trends</Text>
              {breakdown.length === 0 ? (
                <View style={styles.empty}><Feather name="pie-chart" size={28} color={colors.textFaint} /><Text style={[styles.emptyText, { color: colors.textFaint }]}>No spending this month</Text></View>
              ) : (
                breakdown.map((item) => {
                  const pct = (item.total / maxBreakdown) * 100;
                  const totalPct = summary.spent > 0 ? (item.total / summary.spent) * 100 : 0;
                  const color = categoryColors[item.category] || colors.primary;
                  return (
                    <View key={item.category} style={styles.catRow}>
                      <TouchableOpacity
                        style={styles.catRowMain}
                        onPress={() => {
                          setSelectedCategory(item.category);
                          setCategoryTxns(getCategoryTransactions(monthKey, item.category));
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.catDot, { backgroundColor: color }]} />
                        <Text style={[styles.catName, { color: colors.textSub }]} numberOfLines={1}>{item.category}</Text>
                        <Text style={[styles.catPct, { color: colors.textMuted }]}>{totalPct.toFixed(0)}%</Text>
                        <View style={styles.catBarWrap}>
                          <View style={[styles.catBarBg, { backgroundColor: colors.cardAlt }]}>
                            <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                          </View>
                        </View>
                        <Text style={[styles.catAmount, { color: colors.text }]}>{fmtMoney(item.total, true)}</Text>
                        <Feather name="chevron-right" size={14} color={colors.textFaint} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.insightsBtn, { backgroundColor: colors.cardAlt }]}
                        onPress={() => {
                          setInsightsCategoryColor(color);
                          setInsightsCategory(item.category);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="bar-chart-2" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>

            {topExpenses.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Top Expenses</Text>
                {topExpenses.map((tx, idx) => (
                  <View key={tx.id} style={[styles.topRow, idx < topExpenses.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View style={[styles.topRank, { backgroundColor: idx === 0 ? colors.warningBg : colors.cardAlt }]}>
                      <Text style={[styles.topRankText, { color: idx === 0 ? colors.warningText : colors.textMuted }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.topInfo}>
                      <Text style={[styles.topDesc, { color: colors.text }]} numberOfLines={1}>{tx.description || tx.category}</Text>
                      <Text style={[styles.topMeta, { color: colors.textFaint }]}>{tx.category} · {tx.date}</Text>
                    </View>
                    <Text style={[styles.topAmount, { color: colors.danger }]}>{fmtMoney(tx.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === 'insights' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Key Numbers</Text>
              <View style={styles.metricsGrid}>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>📊</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{summary.count}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Transactions</Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>📅</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{fmtMoney(dailyAvg, true)}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Daily Avg</Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>🎯</Text>
                  <Text style={[styles.metricValue, { color: savingsRate >= 0 ? colors.success : colors.danger }]}>{savingsRate.toFixed(0)}%</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Savings Rate</Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>📈</Text>
                  <Text style={[styles.metricValue, { color: spentChange >= 0 ? colors.danger : colors.success }]}>
                    {spentChange >= 0 ? '+' : ''}{spentChange.toFixed(0)}%
                  </Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>vs Last Month</Text>
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Spending by Day</Text>
              {busiestDay.total > 0 && (
                <Text style={[styles.cardSub, { color: colors.textFaint }]}>Most on {busiestDay.day}s · {fmtMoney(busiestDay.total, true)}</Text>
              )}
              <View style={styles.dowChart}>
                {dayStats.map((d) => {
                  const barH = maxDayTotal > 0 ? (d.total / maxDayTotal) * 100 : 0;
                  const isMax = d.total === maxDayTotal && d.total > 0;
                  return (
                    <View key={d.day} style={styles.dowCol}>
                      <View style={[styles.dowBarBg, { backgroundColor: colors.cardAlt }]}>
                        <View style={[styles.dowBarFill, { height: `${Math.max(barH, 2)}%`, backgroundColor: isMax ? colors.warning : colors.primary, opacity: d.total > 0 ? 1 : 0.15 }]} />
                      </View>
                      <Text style={[styles.dowLabel, { color: isMax ? colors.warning : colors.textFaint }, isMax && { fontWeight: '700' }]}>{d.shortDay}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>6-Month Trend</Text>
              <View style={styles.trendChart}>
                {trend.map((point) => {
                  const spentH = maxTrend > 0 ? (point.spent / maxTrend) * 100 : 0;
                  const recvH = maxTrend > 0 ? (point.received / maxTrend) * 100 : 0;
                  const isCurrent = point.month === monthKey;
                  return (
                    <View key={point.month} style={styles.trendCol}>
                      <View style={styles.trendBars}>
                        <View style={[styles.trendBarBg, { backgroundColor: colors.cardAlt }]}>
                          <View style={[styles.trendBarFill, { height: `${Math.max(spentH, 2)}%`, backgroundColor: colors.danger, opacity: isCurrent ? 1 : 0.45 }]} />
                        </View>
                        <View style={[styles.trendBarBg, { backgroundColor: colors.cardAlt }]}>
                          <View style={[styles.trendBarFill, { height: `${Math.max(recvH, 2)}%`, backgroundColor: colors.success, opacity: isCurrent ? 1 : 0.45 }]} />
                        </View>
                      </View>
                      <Text style={[styles.trendLabel, { color: isCurrent ? colors.primary : colors.textFaint }, isCurrent && { fontWeight: '700' }]}>{point.label}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.trendLegend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.danger }]} /><Text style={[styles.legendText, { color: colors.textFaint }]}>Expense</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={[styles.legendText, { color: colors.textFaint }]}>Income</Text></View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <CategoryInsightsModal
        category={insightsCategory}
        categoryColor={insightsCategoryColor}
        onClose={() => setInsightsCategory(null)}
      />

      <Modal
        visible={selectedCategory !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedCategory(null)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.modalTitleRow}>
              <View style={[styles.catDot, { backgroundColor: categoryColors[selectedCategory ?? ''] || colors.primary, width: 12, height: 12, borderRadius: 6 }]} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedCategory}</Text>
            </View>
            <View style={styles.modalMeta}>
              <Text style={[styles.modalMetaText, { color: colors.textFaint }]}>
                {categoryTxns.length} transaction{categoryTxns.length !== 1 ? 's' : ''} · {fmtMoney(categoryTxns.reduce((s, t) => s + t.amount, 0))}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCategory(null)} style={styles.modalClose}>
              <Feather name="x" size={22} color={colors.textSub} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={categoryTxns}
            keyExtractor={(t) => t.id.toString()}
            contentContainerStyle={styles.modalList}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="inbox" size={28} color={colors.textFaint} />
                <Text style={[styles.emptyText, { color: colors.textFaint }]}>No transactions</Text>
              </View>
            }
            renderItem={({ item: tx, index }) => (
              <View style={[styles.modalTxRow, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: index < categoryTxns.length - 1 ? 1 : 0 }]}>
                <View style={styles.modalTxInfo}>
                  <Text style={[styles.modalTxDesc, { color: colors.text }]} numberOfLines={1}>
                    {tx.description || tx.category}
                  </Text>
                  <Text style={[styles.modalTxMeta, { color: colors.textFaint }]}>
                    {tx.date}{tx.bank ? ` · ${tx.bank}` : ''}
                  </Text>
                  {tx.note ? <Text style={[styles.modalTxNote, { color: colors.textFaint }]} numberOfLines={1}>{tx.note}</Text> : null}
                </View>
                <Text style={[styles.modalTxAmount, { color: colors.danger }]}>{fmtMoney(tx.amount)}</Text>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '500' },
  scroll: { flex: 1 },
  card: { borderRadius: 16, margin: 12, marginBottom: 0, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitleRight: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 13, marginBottom: 14 },
  kpiRow: { flexDirection: 'row', alignItems: 'center' },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, height: 60, marginHorizontal: 8 },
  kpiLabel: { fontSize: 12, marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  kpiSub: { fontSize: 12, marginTop: 4 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  changeText: { fontSize: 11, fontWeight: '600' },
  balRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  balIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  balSource: { flex: 1, fontSize: 14, fontWeight: '500' },
  balAmount: { fontSize: 15, fontWeight: '700' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  editBtnText: { fontSize: 13, fontWeight: '600' },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  rupee: { fontSize: 20, fontWeight: '700' },
  budgetInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '600' },
  saveBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  budgetAmounts: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  budgetSpent: { fontSize: 22, fontWeight: '800' },
  budgetOf: { fontSize: 13, fontWeight: '500' },
  budgetRem: { marginLeft: 'auto', fontSize: 14, fontWeight: '700' },
  barBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 10, marginBottom: 6 },
  barFill: { height: '100%', borderRadius: 5 },
  barPct: { fontSize: 12 },
  projBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, marginTop: 10 },
  projText: { flex: 1, fontSize: 13, fontWeight: '500' },
  budgetEmpty: { paddingVertical: 12 },
  budgetEmptyText: { fontSize: 13, textAlign: 'center' },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  catRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightsBtn: { padding: 6, borderRadius: 8, marginLeft: 2 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { width: 90, fontSize: 13, fontWeight: '500' },
  catPct: { width: 30, fontSize: 12, textAlign: 'right' },
  catBarWrap: { flex: 1 },
  catBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  catAmount: { width: 50, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  topRank: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  topRankText: { fontSize: 11, fontWeight: '700' },
  topInfo: { flex: 1 },
  topDesc: { fontSize: 14, fontWeight: '600' },
  topMeta: { fontSize: 11, marginTop: 2 },
  topAmount: { fontSize: 14, fontWeight: '700' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  metricBox: { flex: 1, minWidth: '45%', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
  metricIcon: { fontSize: 20 },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 11, textAlign: 'center' },
  dowChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110, marginTop: 10 },
  dowCol: { flex: 1, alignItems: 'center', gap: 4 },
  dowBarBg: { width: '70%', flex: 1, borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end' },
  dowBarFill: { width: '100%', borderRadius: 3 },
  dowLabel: { fontSize: 10 },
  trendChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, marginTop: 10 },
  trendCol: { flex: 1, alignItems: 'center', gap: 4 },
  trendBars: { flex: 1, flexDirection: 'row', gap: 2, alignItems: 'flex-end', width: '90%' },
  trendBarBg: { flex: 1, height: '100%', borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end' },
  trendBarFill: { width: '100%', borderRadius: 3 },
  trendLabel: { fontSize: 10 },
  trendLegend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 14 },
  modalContainer: { flex: 1 },
  modalHeader: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalMeta: { marginBottom: 12 },
  modalMetaText: { fontSize: 13 },
  modalClose: { position: 'absolute', top: 16, right: 18, padding: 4 },
  modalList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  modalTxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, marginBottom: 0 },
  modalTxInfo: { flex: 1 },
  modalTxDesc: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  modalTxMeta: { fontSize: 12 },
  modalTxNote: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  modalTxAmount: { fontSize: 15, fontWeight: '700' },
});

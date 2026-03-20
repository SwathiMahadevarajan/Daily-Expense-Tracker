import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMonthSummary,
  getCategoryBreakdown,
  getCategories,
  getMonthlyTrend,
  getTopTransactions,
  getDayOfWeekStats,
  getSourceStats,
  getWeeklySpend,
  getSourceTransactionBalance,
  MonthlyTrendPoint,
  TopTransaction,
  DayOfWeekStat,
  SourceStat,
  WeeklySpendPoint,
} from '../../lib/database';
import { getPaymentSources } from '../../lib/paymentSources';
import { useTheme } from '../../lib/theme';

function fmtMoney(n: number, compact = false): string {
  if (compact) {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
  }
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getBudgetKey(monthKey: string) {
  return `budget_${monthKey}`;
}

function getOpeningBalanceKey(source: string) {
  return `source_ob_${source}`;
}

type Tab = 'overview' | 'trends' | 'insights';

interface SourceBalanceInfo {
  source: string;
  openingBalance: number;
  credits: number;
  debits: number;
  transferOut: number;
  transferIn: number;
  currentBalance: number;
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
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
  const [topIncomes, setTopIncomes] = useState<TopTransaction[]>([]);
  const [dayStats, setDayStats] = useState<DayOfWeekStat[]>([]);
  const [sourceStats, setSourceStats] = useState<SourceStat>({ smsImported: 0, smsCount: 0, manual: 0, manualCount: 0 });
  const [weeklySpend, setWeeklySpend] = useState<WeeklySpendPoint[]>([]);

  const monthKey = getMonthKey(year, month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevKey = getMonthKey(prevYear, prevMonth);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

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
    setTopIncomes(getTopTransactions(monthKey, 3, 'credit'));
    setDayStats(getDayOfWeekStats(monthKey));
    setSourceStats(getSourceStats(monthKey));
    setWeeklySpend(getWeeklySpend(monthKey));
    try {
      const stored = await AsyncStorage.getItem(getBudgetKey(monthKey));
      setBudget(stored ? parseFloat(stored) : null);
    } catch {
      setBudget(null);
    }
    try {
      const sources = await getPaymentSources();
      const balInfos: SourceBalanceInfo[] = [];
      for (const source of sources) {
        const obStr = await AsyncStorage.getItem(getOpeningBalanceKey(source));
        const openingBalance = obStr ? parseFloat(obStr) : 0;
        const txBal = getSourceTransactionBalance(source);
        const currentBalance = openingBalance + txBal.credits - txBal.debits + txBal.transferIn - txBal.transferOut;
        balInfos.push({
          source,
          openingBalance,
          credits: txBal.credits,
          debits: txBal.debits,
          transferOut: txBal.transferOut,
          transferIn: txBal.transferIn,
          currentBalance,
        });
      }
      setSourceBalances(balInfos);
    } catch {}
  }, [monthKey, prevKey]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const navigateMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  const saveBudget = async () => {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) { Alert.alert('Invalid', 'Please enter a valid budget amount.'); return; }
    await AsyncStorage.setItem(getBudgetKey(monthKey), val.toString());
    setBudget(val);
    setEditingBudget(false);
    setBudgetInput('');
  };

  const clearBudget = async () => {
    await AsyncStorage.removeItem(getBudgetKey(monthKey));
    setBudget(null);
    setEditingBudget(false);
  };

  const currentMonthKey = getMonthKey(now.getFullYear(), now.getMonth() + 1);

  const spentChange = prevSummary.spent > 0 ? ((summary.spent - prevSummary.spent) / prevSummary.spent) * 100 : 0;
  const savingsRate = summary.received > 0 ? ((summary.received - summary.spent) / summary.received) * 100 : 0;
  const avgTx = summary.count > 0 ? summary.spent / summary.count : 0;
  const maxBreakdown = breakdown.length > 0 ? breakdown[0].total : 1;
  const maxTrend = Math.max(...trend.map(t => t.spent), 1);
  const maxDayTotal = Math.max(...dayStats.map(d => d.total), 1);
  const busiestDay = dayStats.reduce((a, b) => (b.total > a.total ? b : a), dayStats[0] ?? { day: '', total: 0, shortDay: '', count: 0 });
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = monthKey === currentMonthKey ? now.getDate() : daysInMonth;
  const dailyAvg = dayOfMonth > 0 ? summary.spent / dayOfMonth : 0;
  const projectedSpend = dailyAvg * daysInMonth;
  const budgetPct = budget && budget > 0 ? Math.min((summary.spent / budget) * 100, 100) : 0;
  const budgetRemaining = budget ? budget - summary.spent : 0;
  const maxWeekly = Math.max(...weeklySpend.map(w => w.spent), 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.monthNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => navigateMonth(1)}
          style={styles.navBtn}
          disabled={monthKey >= currentMonthKey}
        >
          <Feather name="chevron-right" size={22} color={monthKey >= currentMonthKey ? colors.textFaint : colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['overview', 'trends', 'insights'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textFaint }, activeTab === tab && { fontWeight: '700' }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {activeTab === 'overview' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.kpiRow}>
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.textFaint }]}>Total Spent</Text>
                  <Text style={[styles.kpiValue, { color: colors.danger }]}>{fmtMoney(summary.spent)}</Text>
                  <View style={[styles.changePill, { backgroundColor: spentChange >= 0 ? colors.dangerBg : colors.successBg }]}>
                    <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={10} color={spentChange >= 0 ? colors.danger : colors.success} />
                    <Text style={[styles.changeLabel, { color: spentChange >= 0 ? colors.danger : colors.success }]}>
                      {Math.abs(spentChange).toFixed(1)}% vs last month
                    </Text>
                  </View>
                </View>
                <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.textFaint }]}>Total Received</Text>
                  <Text style={[styles.kpiValue, { color: colors.success }]}>{fmtMoney(summary.received)}</Text>
                  <Text style={[styles.kpiSub, { color: colors.textFaint }]}>{summary.count} transactions</Text>
                </View>
              </View>

              <View style={[styles.netRow, { backgroundColor: colors.cardAlt }]}>
                <View style={styles.netItem}>
                  <Text style={[styles.netLabel, { color: colors.textFaint }]}>Net</Text>
                  <Text style={[styles.netValue, { color: summary.received - summary.spent >= 0 ? colors.success : colors.danger }]}>
                    {summary.received - summary.spent >= 0 ? '+' : '-'}{fmtMoney(Math.abs(summary.received - summary.spent))}
                  </Text>
                </View>
                <View style={styles.netItem}>
                  <Text style={[styles.netLabel, { color: colors.textFaint }]}>Savings Rate</Text>
                  <Text style={[styles.netValue, { color: savingsRate >= 0 ? colors.success : colors.danger }]}>
                    {savingsRate.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.netItem}>
                  <Text style={[styles.netLabel, { color: colors.textFaint }]}>Daily Avg</Text>
                  <Text style={[styles.netValue, { color: colors.text }]}>{fmtMoney(dailyAvg)}</Text>
                </View>
              </View>
            </View>

            {sourceBalances.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Source Balances</Text>
                <Text style={[styles.cardSub, { color: colors.textFaint }]}>Current balance per account (all-time). Set opening balances in Settings.</Text>
                {sourceBalances.map((sb, idx) => (
                  <View key={sb.source} style={[styles.sourceBalRow, idx < sourceBalances.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View style={[styles.sourceBalIcon, { backgroundColor: sb.currentBalance >= 0 ? colors.successBg : colors.dangerBg }]}>
                      <Feather name="credit-card" size={16} color={sb.currentBalance >= 0 ? colors.success : colors.danger} />
                    </View>
                    <View style={styles.sourceBalInfo}>
                      <Text style={[styles.sourceBalName, { color: colors.text }]}>{sb.source}</Text>
                      <Text style={[styles.sourceBalSub, { color: colors.textFaint }]}>
                        +{fmtMoney(sb.credits, true)} in · -{fmtMoney(sb.debits, true)} out
                        {(sb.transferIn > 0 || sb.transferOut > 0) ? ` · transfers: ${fmtMoney(sb.transferIn - sb.transferOut, true)}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.sourceBalAmount, { color: sb.currentBalance >= 0 ? colors.success : colors.danger }]}>
                      {sb.currentBalance >= 0 ? '' : '-'}{fmtMoney(Math.abs(sb.currentBalance))}
                    </Text>
                  </View>
                ))}
                <View style={[styles.sourceBalTotal, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.sourceBalTotalLabel, { color: colors.textMuted }]}>Total Across All Accounts</Text>
                  <Text style={[styles.sourceBalTotalAmt, { color: sourceBalances.reduce((s, b) => s + b.currentBalance, 0) >= 0 ? colors.success : colors.danger }]}>
                    {fmtMoney(sourceBalances.reduce((s, b) => s + b.currentBalance, 0))}
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.budgetHeaderRow}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Monthly Budget</Text>
                <TouchableOpacity
                  style={[styles.budgetEditBtn, { backgroundColor: colors.primaryBg }]}
                  onPress={() => { setEditingBudget(!editingBudget); setBudgetInput(budget ? budget.toString() : ''); }}
                >
                  <Feather name={editingBudget ? 'x' : 'edit-2'} size={14} color={colors.primary} />
                  <Text style={[styles.budgetEditBtnText, { color: colors.primary }]}>{editingBudget ? 'Cancel' : (budget ? 'Edit' : 'Set Budget')}</Text>
                </TouchableOpacity>
              </View>

              {editingBudget ? (
                <View style={styles.budgetInputRow}>
                  <Text style={[styles.budgetRupee, { color: colors.textFaint }]}>₹</Text>
                  <TextInput
                    style={[styles.budgetInput, { backgroundColor: colors.inputBg, color: colors.inputText }]}
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                    keyboardType="numeric"
                    placeholder="Enter monthly budget"
                    placeholderTextColor={colors.placeholder}
                    autoFocus
                  />
                  <TouchableOpacity style={[styles.budgetSaveBtn, { backgroundColor: colors.primary }]} onPress={saveBudget}>
                    <Text style={styles.budgetSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                  {budget !== null && (
                    <TouchableOpacity style={[styles.budgetClearBtn, { backgroundColor: colors.dangerBg }]} onPress={clearBudget}>
                      <Text style={[styles.budgetClearBtnText, { color: colors.danger }]}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : budget !== null ? (
                <>
                  <View style={styles.budgetAmounts}>
                    <View>
                      <Text style={[styles.budgetSpentLabel, { color: colors.textFaint }]}>Spent</Text>
                      <Text style={[styles.budgetSpentAmt, { color: budgetPct >= 90 ? colors.danger : budgetPct >= 70 ? colors.warning : colors.textSub }]}>
                        {fmtMoney(summary.spent)}
                      </Text>
                    </View>
                    <View style={styles.budgetOf}>
                      <Text style={[styles.budgetOfText, { color: colors.textMuted }]}>of {fmtMoney(budget)}</Text>
                      <Text style={[styles.budgetRemText, { color: budgetRemaining >= 0 ? colors.success : colors.danger }]}>
                        {budgetRemaining >= 0 ? fmtMoney(budgetRemaining) + ' left' : fmtMoney(Math.abs(budgetRemaining)) + ' over'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.budgetBarBg, { backgroundColor: colors.cardAlt }]}>
                    <View style={[styles.budgetBarFill, { width: `${budgetPct}%`, backgroundColor: budgetPct >= 90 ? colors.danger : budgetPct >= 70 ? colors.warning : colors.success }]} />
                  </View>
                  <Text style={[styles.budgetPctText, { color: colors.textFaint }]}>{budgetPct.toFixed(0)}% used</Text>
                  {monthKey === currentMonthKey && projectedSpend > 0 && (
                    <View style={[styles.projectionBox, { backgroundColor: projectedSpend > budget ? colors.dangerBg : colors.successBg }]}>
                      <Feather name="activity" size={13} color={projectedSpend > budget ? colors.danger : colors.success} />
                      <Text style={[styles.projectionText, { color: projectedSpend > budget ? colors.dangerText : colors.successText }]}>
                        At this rate, projected spend: {fmtMoney(projectedSpend)}
                        {projectedSpend > budget ? ' — over budget!' : ' — on track'}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.budgetEmpty}>
                  <Feather name="target" size={28} color={colors.textFaint} />
                  <Text style={[styles.budgetEmptyText, { color: colors.textMuted }]}>No budget set for this month</Text>
                  <Text style={[styles.budgetEmptyHint, { color: colors.textFaint }]}>Tap "Set Budget" to track your spending goal</Text>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Spending by Category</Text>
              {breakdown.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="pie-chart" size={32} color={colors.textFaint} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>No spending data this month</Text>
                </View>
              ) : (
                breakdown.map((item, idx) => {
                  const pct = (item.total / maxBreakdown) * 100;
                  const totalPct = summary.spent > 0 ? (item.total / summary.spent) * 100 : 0;
                  const color = categoryColors[item.category] || colors.primary;
                  return (
                    <View key={item.category} style={styles.catRow}>
                      <View style={[styles.catRank, { backgroundColor: colors.cardAlt }]}>
                        <Text style={[styles.catRankText, { color: colors.textMuted }]}>{idx + 1}</Text>
                      </View>
                      <View style={styles.catInfo}>
                        <View style={styles.catTopRow}>
                          <View style={[styles.catDot, { backgroundColor: color }]} />
                          <Text style={[styles.catName, { color: colors.textSub }]} numberOfLines={1}>{item.category}</Text>
                          <Text style={[styles.catCount, { color: colors.textFaint }]}>{item.count} txns</Text>
                          <Text style={[styles.catPct, { color: colors.textMuted }]}>{totalPct.toFixed(0)}%</Text>
                          <Text style={[styles.catAmount, { color: colors.text }]}>{fmtMoney(item.total)}</Text>
                        </View>
                        <View style={[styles.barBg, { backgroundColor: colors.cardAlt }]}>
                          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Top 5 Expenses</Text>
              {topExpenses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="list" size={32} color={colors.textFaint} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>No expenses this month</Text>
                </View>
              ) : (
                topExpenses.map((tx, idx) => (
                  <View key={tx.id} style={[styles.topTxRow, { borderBottomColor: colors.divider }]}>
                    <View style={[styles.topTxRank, { backgroundColor: idx === 0 ? colors.warningBg : colors.cardAlt }]}>
                      <Text style={[styles.topTxRankText, { color: idx === 0 ? colors.warningText : colors.textMuted }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.topTxInfo}>
                      <Text style={[styles.topTxDesc, { color: colors.text }]} numberOfLines={1}>{tx.description || tx.category}</Text>
                      <Text style={[styles.topTxMeta, { color: colors.textFaint }]}>{tx.category} • {tx.date}</Text>
                    </View>
                    <Text style={[styles.topTxAmount, { color: colors.danger }]}>{fmtMoney(tx.amount)}</Text>
                  </View>
                ))
              )}
            </View>

            {topIncomes.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Top Income Sources</Text>
                {topIncomes.map((tx, idx) => (
                  <View key={tx.id} style={[styles.topTxRow, { borderBottomColor: colors.divider }]}>
                    <View style={[styles.topTxRank, { backgroundColor: colors.successBg }]}>
                      <Text style={[styles.topTxRankText, { color: colors.successText }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.topTxInfo}>
                      <Text style={[styles.topTxDesc, { color: colors.text }]} numberOfLines={1}>{tx.description || tx.category}</Text>
                      <Text style={[styles.topTxMeta, { color: colors.textFaint }]}>{tx.category} • {tx.date}</Text>
                    </View>
                    <Text style={[styles.topTxAmount, { color: colors.success }]}>+{fmtMoney(tx.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === 'trends' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>6-Month Spending Trend</Text>
              <View style={styles.barChart}>
                {trend.map((point) => {
                  const barH = maxTrend > 0 ? (point.spent / maxTrend) * 100 : 0;
                  const isCurrentMonth = point.month === monthKey;
                  return (
                    <View key={point.month} style={styles.barChartCol}>
                      <Text style={[styles.barChartVal, { color: colors.textFaint }]}>{fmtMoney(point.spent, true)}</Text>
                      <View style={[styles.barChartBarBg, { backgroundColor: colors.cardAlt }]}>
                        <View style={[styles.barChartBarFill, { height: `${Math.max(barH, 2)}%`, backgroundColor: isCurrentMonth ? colors.primary : colors.primaryBorder }]} />
                      </View>
                      <Text style={[styles.barChartLabel, { color: isCurrentMonth ? colors.primary : colors.textFaint }, isCurrentMonth && { fontWeight: '700' }]}>
                        {point.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Weekly Breakdown — {monthLabel}</Text>
              <Text style={[styles.cardSub, { color: colors.textFaint }]}>How your spending is spread across the month</Text>
              {weeklySpend.every(w => w.spent === 0) ? (
                <View style={styles.emptyState}>
                  <Feather name="calendar" size={32} color={colors.textFaint} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>No data this month</Text>
                </View>
              ) : (
                weeklySpend.map((w) => {
                  const pct = maxWeekly > 0 ? (w.spent / maxWeekly) * 100 : 0;
                  const isMax = w.spent === maxWeekly && w.spent > 0;
                  return (
                    <View key={w.week} style={styles.weekRow}>
                      <Text style={[styles.weekLabel, { color: colors.textMuted }]}>Week {w.week}</Text>
                      <Text style={[styles.weekDates, { color: colors.textFaint }]}>{w.label}</Text>
                      <View style={[styles.weekBarBg, { backgroundColor: colors.cardAlt }]}>
                        <View style={[styles.weekBarFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: isMax ? colors.primary : colors.primaryBorder }]} />
                      </View>
                      <Text style={[styles.weekAmt, { color: isMax ? colors.primary : colors.textSub }, isMax && { fontWeight: '700' }]}>
                        {fmtMoney(w.spent, true)}
                      </Text>
                      <Text style={[styles.weekCount, { color: colors.textFaint }]}>{w.count}t</Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Month-over-Month</Text>
              <View style={styles.momRow}>
                <View style={styles.momItem}>
                  <Text style={[styles.momItemLabel, { color: colors.textFaint }]}>This Month</Text>
                  <Text style={[styles.momAmount, { color: colors.danger }]}>{fmtMoney(summary.spent)}</Text>
                  <Text style={[styles.momCount, { color: colors.textFaint }]}>{summary.count} transactions</Text>
                </View>
                <View style={styles.momMiddle}>
                  <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={28} color={spentChange >= 0 ? colors.danger : colors.success} />
                  <Text style={[styles.momPct, { color: spentChange >= 0 ? colors.danger : colors.success }]}>
                    {spentChange >= 0 ? '+' : ''}{spentChange.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.momItem}>
                  <Text style={[styles.momItemLabel, { color: colors.textFaint }]}>Last Month</Text>
                  <Text style={[styles.momAmount, { color: colors.textMuted }]}>{fmtMoney(prevSummary.spent)}</Text>
                  <Text style={[styles.momCount, { color: colors.textFaint }]}>{prevSummary.count} transactions</Text>
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Income vs Expense (6 Months)</Text>
              {trend.map((point) => (
                <View key={point.month} style={styles.incomeExpRow}>
                  <Text style={[styles.incomeExpLabel, { color: point.month === monthKey ? colors.primary : colors.textMuted }, point.month === monthKey && { fontWeight: '700' }]}>
                    {point.label}
                  </Text>
                  <View style={styles.incomeExpBars}>
                    <View style={styles.incomeExpBarRow}>
                      <View style={[styles.incomeExpBar, { width: maxTrend > 0 ? `${(point.spent / maxTrend) * 100}%` : '0%', backgroundColor: colors.danger, opacity: 0.5 }]} />
                      <Text style={[styles.incomeExpBarLabel, { color: colors.textFaint }]}>{fmtMoney(point.spent, true)}</Text>
                    </View>
                    <View style={styles.incomeExpBarRow}>
                      <View style={[styles.incomeExpBar, { width: maxTrend > 0 ? `${(point.received / maxTrend) * 100}%` : '0%', backgroundColor: colors.success, opacity: 0.5 }]} />
                      <Text style={[styles.incomeExpBarLabel, { color: colors.textFaint }]}>{fmtMoney(point.received, true)}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.danger, opacity: 0.6 }]} /><Text style={[styles.legendText, { color: colors.textFaint }]}>Expense</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success, opacity: 0.6 }]} /><Text style={[styles.legendText, { color: colors.textFaint }]}>Income</Text></View>
              </View>
            </View>
          </>
        )}

        {activeTab === 'insights' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Key Metrics</Text>
              <View style={styles.metricsGrid}>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>📊</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{summary.count}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Transactions</Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>💸</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{fmtMoney(avgTx, true)}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Avg Expense</Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>🎯</Text>
                  <Text style={[styles.metricValue, { color: savingsRate >= 0 ? colors.success : colors.danger }]}>{savingsRate.toFixed(0)}%</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Savings Rate</Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={styles.metricIcon}>📅</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{fmtMoney(dailyAvg, true)}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textFaint }]}>Daily Spend</Text>
                </View>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Spending by Day of Week</Text>
              <Text style={[styles.cardSub, { color: colors.textFaint }]}>
                {busiestDay.total > 0 ? `Busiest day: ${busiestDay.day} (${fmtMoney(busiestDay.total, true)})` : 'No spending data this month'}
              </Text>
              <View style={styles.dowChart}>
                {dayStats.map((d) => {
                  const barH = maxDayTotal > 0 ? (d.total / maxDayTotal) * 100 : 0;
                  const isMax = d.total === maxDayTotal && d.total > 0;
                  return (
                    <View key={d.day} style={styles.dowCol}>
                      <Text style={[styles.dowVal, { color: colors.textFaint }]}>{d.total > 0 ? fmtMoney(d.total, true) : ''}</Text>
                      <View style={[styles.dowBarBg, { backgroundColor: colors.cardAlt }]}>
                        <View style={[styles.dowBarFill, { height: `${Math.max(barH, 2)}%`, backgroundColor: isMax ? colors.warning : colors.primary, opacity: d.total > 0 ? 1 : 0.15 }]} />
                      </View>
                      <Text style={[styles.dowLabel, { color: isMax ? colors.warning : colors.textFaint }, isMax && { fontWeight: '700' }]}>{d.shortDay}</Text>
                    </View>
                  );
                })}
              </View>
              {busiestDay.total > 0 && (
                <Text style={[styles.dowInsight, { color: colors.textMuted }]}>
                  You spend the most on {busiestDay.day}s. Consider planning purchases on cheaper days.
                </Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Spending Efficiency</Text>
              <View style={styles.efficiencyGrid}>
                <View style={[styles.efficiencyItem, { backgroundColor: colors.cardAlt }]}>
                  <View style={[styles.efficiencyIcon, { backgroundColor: colors.primaryBg }]}>
                    <Feather name="zap" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.efficiencyValue, { color: colors.text }]}>{fmtMoney(projectedSpend, true)}</Text>
                  <Text style={[styles.efficiencyLabel, { color: colors.textFaint }]}>Projected Monthly</Text>
                </View>
                <View style={[styles.efficiencyItem, { backgroundColor: colors.cardAlt }]}>
                  <View style={[styles.efficiencyIcon, { backgroundColor: colors.warningBg }]}>
                    <Feather name="calendar" size={18} color={colors.warning} />
                  </View>
                  <Text style={[styles.efficiencyValue, { color: colors.text }]}>{dayOfMonth}</Text>
                  <Text style={[styles.efficiencyLabel, { color: colors.textFaint }]}>Days Elapsed</Text>
                </View>
                <View style={[styles.efficiencyItem, { backgroundColor: colors.cardAlt }]}>
                  <View style={[styles.efficiencyIcon, { backgroundColor: colors.successBg }]}>
                    <Feather name="trending-down" size={18} color={colors.success} />
                  </View>
                  <Text style={[styles.efficiencyValue, { color: colors.text }]}>{daysInMonth - dayOfMonth}</Text>
                  <Text style={[styles.efficiencyLabel, { color: colors.textFaint }]}>Days Remaining</Text>
                </View>
              </View>
              {budget !== null && (
                <View style={[styles.budgetAlertBox, { backgroundColor: budgetRemaining < 0 ? colors.dangerBg : budgetPct > 70 ? colors.warningBg : colors.successBg }]}>
                  <Feather
                    name={budgetRemaining < 0 ? 'alert-circle' : budgetPct > 70 ? 'alert-triangle' : 'check-circle'}
                    size={14}
                    color={budgetRemaining < 0 ? colors.danger : budgetPct > 70 ? colors.warning : colors.success}
                  />
                  <Text style={[styles.budgetAlertText, { color: budgetRemaining < 0 ? colors.dangerText : budgetPct > 70 ? colors.warningText : colors.successText }]}>
                    {budgetRemaining < 0
                      ? `Over budget by ${fmtMoney(Math.abs(budgetRemaining))}`
                      : budgetPct > 70
                      ? `${fmtMoney(budgetRemaining)} remaining — watch your spending`
                      : `On track! ${fmtMoney(budgetRemaining)} remaining`}
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>SMS vs Manual Entries</Text>
              {(sourceStats.smsCount + sourceStats.manualCount) === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={32} color={colors.textFaint} />
                  <Text style={[styles.emptyText, { color: colors.textFaint }]}>No expense data this month</Text>
                </View>
              ) : (
                <>
                  <View style={styles.sourceRow}>
                    <View style={styles.sourceItem}>
                      <Feather name="message-circle" size={22} color={colors.primary} />
                      <Text style={[styles.sourceLabel, { color: colors.textMuted }]}>SMS Imported</Text>
                      <Text style={[styles.sourceValue, { color: colors.text }]}>{fmtMoney(sourceStats.smsImported)}</Text>
                      <Text style={[styles.sourceCount, { color: colors.textFaint }]}>{sourceStats.smsCount} transactions</Text>
                    </View>
                    <View style={[styles.sourceDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.sourceItem}>
                      <Feather name="edit" size={22} color={colors.success} />
                      <Text style={[styles.sourceLabel, { color: colors.textMuted }]}>Added Manually</Text>
                      <Text style={[styles.sourceValue, { color: colors.text }]}>{fmtMoney(sourceStats.manual)}</Text>
                      <Text style={[styles.sourceCount, { color: colors.textFaint }]}>{sourceStats.manualCount} transactions</Text>
                    </View>
                  </View>
                  {sourceStats.smsCount + sourceStats.manualCount > 0 && (
                    <View style={[styles.sourceBar, { backgroundColor: colors.cardAlt }]}>
                      <View style={[styles.sourceBarSms, { flex: sourceStats.smsCount }]} />
                      <View style={[styles.sourceBarManual, { flex: Math.max(sourceStats.manualCount, 0.01) }]} />
                    </View>
                  )}
                  <Text style={[styles.sourcePctText, { color: colors.textFaint }]}>
                    {sourceStats.smsCount + sourceStats.manualCount > 0
                      ? `${Math.round((sourceStats.smsCount / (sourceStats.smsCount + sourceStats.manualCount)) * 100)}% from SMS`
                      : ''}
                  </Text>
                </>
              )}
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '500' },
  scroll: { flex: 1 },
  card: { borderRadius: 16, margin: 12, marginBottom: 0, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardSub: { fontSize: 13, marginBottom: 14 },
  kpiRow: { flexDirection: 'row', marginBottom: 16 },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, marginHorizontal: 8 },
  kpiLabel: { fontSize: 12, marginBottom: 4 },
  kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  kpiSub: { fontSize: 12, marginTop: 4 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  changeLabel: { fontSize: 11, fontWeight: '600' },
  netRow: { flexDirection: 'row', borderRadius: 12, padding: 12 },
  netItem: { flex: 1, alignItems: 'center' },
  netLabel: { fontSize: 11, marginBottom: 4 },
  netValue: { fontSize: 15, fontWeight: '700' },
  sourceBalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  sourceBalIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sourceBalInfo: { flex: 1 },
  sourceBalName: { fontSize: 15, fontWeight: '600' },
  sourceBalSub: { fontSize: 12, marginTop: 2 },
  sourceBalAmount: { fontSize: 16, fontWeight: '700' },
  sourceBalTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 12, marginTop: 8 },
  sourceBalTotalLabel: { fontSize: 13, fontWeight: '500' },
  sourceBalTotalAmt: { fontSize: 16, fontWeight: '800' },
  budgetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  budgetEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  budgetEditBtnText: { fontSize: 13, fontWeight: '600' },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  budgetRupee: { fontSize: 20, fontWeight: '700' },
  budgetInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, fontWeight: '600' },
  budgetSaveBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  budgetSaveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  budgetClearBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  budgetClearBtnText: { fontWeight: '700', fontSize: 14 },
  budgetAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  budgetSpentLabel: { fontSize: 12, marginBottom: 2 },
  budgetSpentAmt: { fontSize: 22, fontWeight: '800' },
  budgetOf: { alignItems: 'flex-end' },
  budgetOfText: { fontSize: 13, fontWeight: '500' },
  budgetRemText: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  budgetBarBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  budgetBarFill: { height: '100%', borderRadius: 5 },
  budgetPctText: { fontSize: 12, marginBottom: 10 },
  projectionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 10 },
  projectionText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  budgetEmpty: { alignItems: 'center', paddingVertical: 16 },
  budgetEmptyText: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  budgetEmptyHint: { fontSize: 13, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  catRank: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  catRankText: { fontSize: 12, fontWeight: '700' },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 14, fontWeight: '500' },
  catCount: { fontSize: 11 },
  catPct: { fontSize: 12, fontWeight: '600', minWidth: 28, textAlign: 'right' },
  catAmount: { fontSize: 14, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  barBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  topTxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  topTxRank: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
  topTxRankText: { fontSize: 12, fontWeight: '700' },
  topTxInfo: { flex: 1 },
  topTxDesc: { fontSize: 14, fontWeight: '600' },
  topTxMeta: { fontSize: 12, marginTop: 2 },
  topTxAmount: { fontSize: 15, fontWeight: '700' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140, marginTop: 8 },
  barChartCol: { flex: 1, alignItems: 'center', gap: 4 },
  barChartVal: { fontSize: 9, textAlign: 'center' },
  barChartBarBg: { width: '70%', flex: 1, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  barChartBarFill: { width: '100%', borderRadius: 4 },
  barChartLabel: { fontSize: 10 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  weekLabel: { fontSize: 12, fontWeight: '600', width: 44 },
  weekDates: { fontSize: 11, width: 38 },
  weekBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  weekBarFill: { height: '100%', borderRadius: 4 },
  weekAmt: { fontSize: 12, fontWeight: '600', minWidth: 40, textAlign: 'right' },
  weekCount: { fontSize: 10, minWidth: 16 },
  momRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  momItem: { flex: 1, alignItems: 'center' },
  momItemLabel: { fontSize: 12, marginBottom: 6 },
  momAmount: { fontSize: 20, fontWeight: '800' },
  momCount: { fontSize: 12, marginTop: 4 },
  momMiddle: { alignItems: 'center', paddingHorizontal: 12 },
  momPct: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  incomeExpRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  incomeExpLabel: { fontSize: 12, width: 30 },
  incomeExpBars: { flex: 1, gap: 4 },
  incomeExpBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  incomeExpBar: { height: 8, borderRadius: 4, minWidth: 4 },
  incomeExpBarLabel: { fontSize: 10 },
  legend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metricBox: { flex: 1, minWidth: '45%', borderRadius: 12, padding: 14, alignItems: 'center' },
  metricIcon: { fontSize: 22, marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  dowChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, marginTop: 8 },
  dowCol: { flex: 1, alignItems: 'center', gap: 4 },
  dowVal: { fontSize: 8, textAlign: 'center' },
  dowBarBg: { width: '70%', flex: 1, borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end' },
  dowBarFill: { width: '100%', borderRadius: 3 },
  dowLabel: { fontSize: 10 },
  dowInsight: { fontSize: 12, marginTop: 10, fontStyle: 'italic', textAlign: 'center' },
  efficiencyGrid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  efficiencyItem: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 6 },
  efficiencyIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  efficiencyValue: { fontSize: 17, fontWeight: '800' },
  efficiencyLabel: { fontSize: 10, textAlign: 'center' },
  budgetAlertBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 10, marginTop: 12 },
  budgetAlertText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  sourceItem: { flex: 1, alignItems: 'center', gap: 4 },
  sourceDivider: { width: 1, height: 60 },
  sourceLabel: { fontSize: 12 },
  sourceValue: { fontSize: 17, fontWeight: '700' },
  sourceCount: { fontSize: 11 },
  sourceBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  sourceBarSms: { backgroundColor: '#6366F1' },
  sourceBarManual: { backgroundColor: '#10B981' },
  sourcePctText: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { marginTop: 8, fontSize: 14 },
});

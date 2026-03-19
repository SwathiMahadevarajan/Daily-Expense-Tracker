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
  MonthlyTrendPoint,
  TopTransaction,
  DayOfWeekStat,
  SourceStat,
  WeeklySpendPoint,
} from '../../lib/database';

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

type Tab = 'overview' | 'trends' | 'insights';

export default function AnalyticsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [budget, setBudget] = useState<number | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

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
    const colors: Record<string, string> = {};
    cats.forEach(c => { colors[c.name] = c.color; });
    setSummary(s);
    setPrevSummary(p);
    setBreakdown(getCategoryBreakdown(monthKey));
    setCategoryColors(colors);
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
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid', 'Please enter a valid budget amount.');
      return;
    }
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
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
          <Feather name="chevron-left" size={22} color="#6366F1" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => navigateMonth(1)}
          style={styles.navBtn}
          disabled={monthKey >= currentMonthKey}
        >
          <Feather name="chevron-right" size={22} color={monthKey >= currentMonthKey ? '#D1D5DB' : '#6366F1'} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {(['overview', 'trends', 'insights'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {activeTab === 'overview' && (
          <>
            <View style={styles.card}>
              <View style={styles.kpiRow}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiLabel}>Total Spent</Text>
                  <Text style={[styles.kpiValue, { color: '#EF4444' }]}>{fmtMoney(summary.spent)}</Text>
                  <View style={[styles.changePill, { backgroundColor: spentChange >= 0 ? '#FEE2E2' : '#D1FAE5' }]}>
                    <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={10} color={spentChange >= 0 ? '#DC2626' : '#059669'} />
                    <Text style={[styles.changeLabel, { color: spentChange >= 0 ? '#DC2626' : '#059669' }]}>
                      {Math.abs(spentChange).toFixed(1)}% vs last month
                    </Text>
                  </View>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiLabel}>Total Received</Text>
                  <Text style={[styles.kpiValue, { color: '#10B981' }]}>{fmtMoney(summary.received)}</Text>
                  <Text style={styles.kpiSub}>{summary.count} transactions</Text>
                </View>
              </View>

              <View style={styles.netRow}>
                <View style={styles.netItem}>
                  <Text style={styles.netLabel}>Net</Text>
                  <Text style={[styles.netValue, { color: summary.received - summary.spent >= 0 ? '#10B981' : '#EF4444' }]}>
                    {summary.received - summary.spent >= 0 ? '+' : '-'}{fmtMoney(Math.abs(summary.received - summary.spent))}
                  </Text>
                </View>
                <View style={styles.netItem}>
                  <Text style={styles.netLabel}>Savings Rate</Text>
                  <Text style={[styles.netValue, { color: savingsRate >= 0 ? '#10B981' : '#EF4444' }]}>
                    {savingsRate.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.netItem}>
                  <Text style={styles.netLabel}>Daily Avg</Text>
                  <Text style={styles.netValue}>{fmtMoney(dailyAvg)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.budgetHeaderRow}>
                <Text style={styles.cardTitle}>Monthly Budget</Text>
                <TouchableOpacity
                  style={styles.budgetEditBtn}
                  onPress={() => {
                    setEditingBudget(!editingBudget);
                    setBudgetInput(budget ? budget.toString() : '');
                  }}
                >
                  <Feather name={editingBudget ? 'x' : 'edit-2'} size={14} color="#6366F1" />
                  <Text style={styles.budgetEditBtnText}>{editingBudget ? 'Cancel' : (budget ? 'Edit' : 'Set Budget')}</Text>
                </TouchableOpacity>
              </View>

              {editingBudget ? (
                <View style={styles.budgetInputRow}>
                  <Text style={styles.budgetRupee}>₹</Text>
                  <TextInput
                    style={styles.budgetInput}
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                    keyboardType="numeric"
                    placeholder="Enter monthly budget"
                    placeholderTextColor="#9CA3AF"
                    autoFocus
                  />
                  <TouchableOpacity style={styles.budgetSaveBtn} onPress={saveBudget}>
                    <Text style={styles.budgetSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                  {budget !== null && (
                    <TouchableOpacity style={styles.budgetClearBtn} onPress={clearBudget}>
                      <Text style={styles.budgetClearBtnText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : budget !== null ? (
                <>
                  <View style={styles.budgetAmounts}>
                    <View>
                      <Text style={styles.budgetSpentLabel}>Spent</Text>
                      <Text style={[styles.budgetSpentAmt, { color: budgetPct >= 90 ? '#EF4444' : budgetPct >= 70 ? '#F59E0B' : '#374151' }]}>
                        {fmtMoney(summary.spent)}
                      </Text>
                    </View>
                    <View style={styles.budgetOf}>
                      <Text style={styles.budgetOfText}>of {fmtMoney(budget)}</Text>
                      <Text style={[styles.budgetRemText, { color: budgetRemaining >= 0 ? '#10B981' : '#EF4444' }]}>
                        {budgetRemaining >= 0 ? fmtMoney(budgetRemaining) + ' left' : fmtMoney(Math.abs(budgetRemaining)) + ' over'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.budgetBarBg}>
                    <View style={[styles.budgetBarFill, {
                      width: `${budgetPct}%`,
                      backgroundColor: budgetPct >= 90 ? '#EF4444' : budgetPct >= 70 ? '#F59E0B' : '#10B981',
                    }]} />
                  </View>
                  <Text style={styles.budgetPctText}>{budgetPct.toFixed(0)}% used</Text>
                  {monthKey === currentMonthKey && projectedSpend > 0 && (
                    <View style={[styles.projectionBox, { backgroundColor: projectedSpend > budget ? '#FEF2F2' : '#F0FDF4' }]}>
                      <Feather name="activity" size={13} color={projectedSpend > budget ? '#EF4444' : '#10B981'} />
                      <Text style={[styles.projectionText, { color: projectedSpend > budget ? '#DC2626' : '#059669' }]}>
                        At this rate, projected spend: {fmtMoney(projectedSpend)}
                        {projectedSpend > budget ? ' — over budget!' : ' — on track'}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.budgetEmpty}>
                  <Feather name="target" size={28} color="#D1D5DB" />
                  <Text style={styles.budgetEmptyText}>No budget set for this month</Text>
                  <Text style={styles.budgetEmptyHint}>Tap "Set Budget" to track your spending goal</Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Spending by Category</Text>
              {breakdown.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="pie-chart" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No spending data this month</Text>
                </View>
              ) : (
                breakdown.map((item, idx) => {
                  const pct = (item.total / maxBreakdown) * 100;
                  const totalPct = summary.spent > 0 ? (item.total / summary.spent) * 100 : 0;
                  const color = categoryColors[item.category] || '#6366F1';
                  return (
                    <View key={item.category} style={styles.catRow}>
                      <View style={styles.catRank}>
                        <Text style={styles.catRankText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.catInfo}>
                        <View style={styles.catTopRow}>
                          <View style={[styles.catDot, { backgroundColor: color }]} />
                          <Text style={styles.catName} numberOfLines={1}>{item.category}</Text>
                          <Text style={styles.catCount}>{item.count} txns</Text>
                          <Text style={styles.catPct}>{totalPct.toFixed(0)}%</Text>
                          <Text style={styles.catAmount}>{fmtMoney(item.total)}</Text>
                        </View>
                        <View style={styles.barBg}>
                          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top 5 Expenses</Text>
              {topExpenses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="list" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No expenses this month</Text>
                </View>
              ) : (
                topExpenses.map((tx, idx) => (
                  <View key={tx.id} style={styles.topTxRow}>
                    <View style={[styles.topTxRank, { backgroundColor: idx === 0 ? '#FEF3C7' : '#F3F4F6' }]}>
                      <Text style={[styles.topTxRankText, { color: idx === 0 ? '#D97706' : '#6B7280' }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.topTxInfo}>
                      <Text style={styles.topTxDesc} numberOfLines={1}>{tx.description || tx.category}</Text>
                      <Text style={styles.topTxMeta}>{tx.category} • {tx.date}</Text>
                    </View>
                    <Text style={styles.topTxAmount}>{fmtMoney(tx.amount)}</Text>
                  </View>
                ))
              )}
            </View>

            {topIncomes.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Top Income Sources</Text>
                {topIncomes.map((tx, idx) => (
                  <View key={tx.id} style={styles.topTxRow}>
                    <View style={[styles.topTxRank, { backgroundColor: '#D1FAE5' }]}>
                      <Text style={[styles.topTxRankText, { color: '#059669' }]}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.topTxInfo}>
                      <Text style={styles.topTxDesc} numberOfLines={1}>{tx.description || tx.category}</Text>
                      <Text style={styles.topTxMeta}>{tx.category} • {tx.date}</Text>
                    </View>
                    <Text style={[styles.topTxAmount, { color: '#10B981' }]}>+{fmtMoney(tx.amount)}</Text>
                  </View>
                ))}
                {summary.received > 0 && (
                  <View style={styles.salaryNote}>
                    <Feather name="info" size={12} color="#6B7280" />
                    <Text style={styles.salaryNoteText}>
                      Tip: If your salary arrives at the end of last month, you can add it to this month's date so your savings rate reflects your actual monthly budget.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {activeTab === 'trends' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>6-Month Spending Trend</Text>
              <View style={styles.barChart}>
                {trend.map((point) => {
                  const barH = maxTrend > 0 ? (point.spent / maxTrend) * 100 : 0;
                  const isCurrentMonth = point.month === monthKey;
                  return (
                    <View key={point.month} style={styles.barChartCol}>
                      <Text style={styles.barChartVal}>{fmtMoney(point.spent, true)}</Text>
                      <View style={styles.barChartBarBg}>
                        <View
                          style={[
                            styles.barChartBarFill,
                            {
                              height: `${Math.max(barH, 2)}%`,
                              backgroundColor: isCurrentMonth ? '#6366F1' : '#C7D2FE',
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barChartLabel, isCurrentMonth && { color: '#6366F1', fontWeight: '700' }]}>
                        {point.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Weekly Breakdown — {monthLabel}</Text>
              <Text style={styles.cardSub}>How your spending is spread across the month</Text>
              {weeklySpend.every(w => w.spent === 0) ? (
                <View style={styles.emptyState}>
                  <Feather name="calendar" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No data this month</Text>
                </View>
              ) : (
                weeklySpend.map((w) => {
                  const pct = maxWeekly > 0 ? (w.spent / maxWeekly) * 100 : 0;
                  const isMax = w.spent === maxWeekly && w.spent > 0;
                  return (
                    <View key={w.week} style={styles.weekRow}>
                      <Text style={styles.weekLabel}>Week {w.week}</Text>
                      <Text style={styles.weekDates}>{w.label}</Text>
                      <View style={styles.weekBarBg}>
                        <View style={[styles.weekBarFill, {
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: isMax ? '#6366F1' : '#C7D2FE',
                        }]} />
                      </View>
                      <Text style={[styles.weekAmt, isMax && { color: '#6366F1', fontWeight: '700' }]}>
                        {fmtMoney(w.spent, true)}
                      </Text>
                      <Text style={styles.weekCount}>{w.count}t</Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Month-over-Month</Text>
              <View style={styles.momRow}>
                <View style={styles.momItem}>
                  <Text style={styles.momItemLabel}>This Month</Text>
                  <Text style={[styles.momAmount, { color: '#EF4444' }]}>{fmtMoney(summary.spent)}</Text>
                  <Text style={styles.momCount}>{summary.count} transactions</Text>
                </View>
                <View style={styles.momMiddle}>
                  <Feather name={spentChange >= 0 ? 'trending-up' : 'trending-down'} size={28} color={spentChange >= 0 ? '#EF4444' : '#10B981'} />
                  <Text style={[styles.momPct, { color: spentChange >= 0 ? '#EF4444' : '#10B981' }]}>
                    {spentChange >= 0 ? '+' : ''}{spentChange.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.momItem}>
                  <Text style={styles.momItemLabel}>Last Month</Text>
                  <Text style={[styles.momAmount, { color: '#6B7280' }]}>{fmtMoney(prevSummary.spent)}</Text>
                  <Text style={styles.momCount}>{prevSummary.count} transactions</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Income vs Expense (6 Months)</Text>
              {trend.map((point) => (
                <View key={point.month} style={styles.incomeExpRow}>
                  <Text style={[styles.incomeExpLabel, point.month === monthKey && { color: '#6366F1', fontWeight: '700' }]}>
                    {point.label}
                  </Text>
                  <View style={styles.incomeExpBars}>
                    <View style={styles.incomeExpBarRow}>
                      <View style={[styles.incomeExpBar, {
                        width: maxTrend > 0 ? `${(point.spent / maxTrend) * 100}%` : '0%',
                        backgroundColor: '#FCA5A5'
                      }]} />
                      <Text style={styles.incomeExpBarLabel}>{fmtMoney(point.spent, true)}</Text>
                    </View>
                    <View style={styles.incomeExpBarRow}>
                      <View style={[styles.incomeExpBar, {
                        width: maxTrend > 0 ? `${(point.received / maxTrend) * 100}%` : '0%',
                        backgroundColor: '#6EE7B7'
                      }]} />
                      <Text style={styles.incomeExpBarLabel}>{fmtMoney(point.received, true)}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FCA5A5' }]} /><Text style={styles.legendText}>Expense</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#6EE7B7' }]} /><Text style={styles.legendText}>Income</Text></View>
              </View>
            </View>
          </>
        )}

        {activeTab === 'insights' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Key Metrics</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricIcon}>📊</Text>
                  <Text style={styles.metricValue}>{summary.count}</Text>
                  <Text style={styles.metricLabel}>Transactions</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricIcon}>💸</Text>
                  <Text style={styles.metricValue}>{fmtMoney(avgTx, true)}</Text>
                  <Text style={styles.metricLabel}>Avg Expense</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricIcon}>🎯</Text>
                  <Text style={[styles.metricValue, { color: savingsRate >= 0 ? '#10B981' : '#EF4444' }]}>
                    {savingsRate.toFixed(0)}%
                  </Text>
                  <Text style={styles.metricLabel}>Savings Rate</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricIcon}>📅</Text>
                  <Text style={styles.metricValue}>{fmtMoney(dailyAvg, true)}</Text>
                  <Text style={styles.metricLabel}>Daily Spend</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Spending by Day of Week</Text>
              <Text style={styles.cardSub}>
                {busiestDay.total > 0 ? `Busiest day: ${busiestDay.day} (${fmtMoney(busiestDay.total, true)})` : 'No spending data this month'}
              </Text>
              <View style={styles.dowChart}>
                {dayStats.map((d) => {
                  const barH = maxDayTotal > 0 ? (d.total / maxDayTotal) * 100 : 0;
                  const isMax = d.total === maxDayTotal && d.total > 0;
                  return (
                    <View key={d.day} style={styles.dowCol}>
                      <Text style={styles.dowVal}>{d.total > 0 ? fmtMoney(d.total, true) : ''}</Text>
                      <View style={styles.dowBarBg}>
                        <View style={[styles.dowBarFill, {
                          height: `${Math.max(barH, 2)}%`,
                          backgroundColor: isMax ? '#F59E0B' : '#6366F1',
                          opacity: d.total > 0 ? 1 : 0.15,
                        }]} />
                      </View>
                      <Text style={[styles.dowLabel, isMax && { color: '#F59E0B', fontWeight: '700' }]}>{d.shortDay}</Text>
                    </View>
                  );
                })}
              </View>
              {busiestDay.total > 0 && (
                <Text style={styles.dowInsight}>
                  You spend the most on {busiestDay.day}s. Consider planning purchases on cheaper days.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Spending Efficiency</Text>
              <View style={styles.efficiencyGrid}>
                <View style={styles.efficiencyItem}>
                  <View style={[styles.efficiencyIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Feather name="zap" size={18} color="#6366F1" />
                  </View>
                  <Text style={styles.efficiencyValue}>{fmtMoney(projectedSpend, true)}</Text>
                  <Text style={styles.efficiencyLabel}>Projected Monthly</Text>
                </View>
                <View style={styles.efficiencyItem}>
                  <View style={[styles.efficiencyIcon, { backgroundColor: '#FEF3C7' }]}>
                    <Feather name="calendar" size={18} color="#D97706" />
                  </View>
                  <Text style={styles.efficiencyValue}>{dayOfMonth}</Text>
                  <Text style={styles.efficiencyLabel}>Days Elapsed</Text>
                </View>
                <View style={styles.efficiencyItem}>
                  <View style={[styles.efficiencyIcon, { backgroundColor: '#D1FAE5' }]}>
                    <Feather name="trending-down" size={18} color="#059669" />
                  </View>
                  <Text style={styles.efficiencyValue}>{daysInMonth - dayOfMonth}</Text>
                  <Text style={styles.efficiencyLabel}>Days Remaining</Text>
                </View>
              </View>
              {budget !== null && (
                <View style={[styles.budgetAlertBox, { backgroundColor: budgetRemaining < 0 ? '#FEF2F2' : budgetPct > 70 ? '#FFFBEB' : '#F0FDF4' }]}>
                  <Feather
                    name={budgetRemaining < 0 ? 'alert-circle' : budgetPct > 70 ? 'alert-triangle' : 'check-circle'}
                    size={14}
                    color={budgetRemaining < 0 ? '#EF4444' : budgetPct > 70 ? '#D97706' : '#10B981'}
                  />
                  <Text style={[styles.budgetAlertText, { color: budgetRemaining < 0 ? '#DC2626' : budgetPct > 70 ? '#92400E' : '#065F46' }]}>
                    {budgetRemaining < 0
                      ? `Over budget by ${fmtMoney(Math.abs(budgetRemaining))}`
                      : budgetPct > 70
                      ? `${fmtMoney(budgetRemaining)} remaining — watch your spending`
                      : `On track! ${fmtMoney(budgetRemaining)} remaining`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>SMS vs Manual Entries</Text>
              {(sourceStats.smsCount + sourceStats.manualCount) === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No expense data this month</Text>
                </View>
              ) : (
                <>
                  <View style={styles.sourceRow}>
                    <View style={styles.sourceItem}>
                      <Feather name="message-circle" size={22} color="#6366F1" />
                      <Text style={styles.sourceLabel}>SMS Imported</Text>
                      <Text style={styles.sourceValue}>{fmtMoney(sourceStats.smsImported)}</Text>
                      <Text style={styles.sourceCount}>{sourceStats.smsCount} transactions</Text>
                    </View>
                    <View style={styles.sourceDivider} />
                    <View style={styles.sourceItem}>
                      <Feather name="edit" size={22} color="#10B981" />
                      <Text style={styles.sourceLabel}>Added Manually</Text>
                      <Text style={styles.sourceValue}>{fmtMoney(sourceStats.manual)}</Text>
                      <Text style={styles.sourceCount}>{sourceStats.manualCount} transactions</Text>
                    </View>
                  </View>
                  {sourceStats.smsCount + sourceStats.manualCount > 0 && (
                    <View style={styles.sourceBar}>
                      <View style={[styles.sourceBarSms, { flex: sourceStats.smsCount }]} />
                      <View style={[styles.sourceBarManual, { flex: Math.max(sourceStats.manualCount, 0.01) }]} />
                    </View>
                  )}
                  <Text style={styles.sourcePctText}>
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  navBtn: { padding: 6 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#111827' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 11,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#6366F1' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#9CA3AF' },
  tabTextActive: { color: '#6366F1', fontWeight: '700' },
  scroll: { flex: 1 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, margin: 12, marginBottom: 0, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#9CA3AF', marginBottom: 14 },
  kpiRow: { flexDirection: 'row', marginBottom: 16 },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8 },
  kpiLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  kpiSub: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  changeLabel: { fontSize: 11, fontWeight: '600' },
  netRow: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12 },
  netItem: { flex: 1, alignItems: 'center' },
  netLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  netValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  budgetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  budgetEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  budgetEditBtnText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  budgetRupee: { fontSize: 20, fontWeight: '700', color: '#9CA3AF' },
  budgetInput: {
    flex: 1, backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 17, color: '#111827', fontWeight: '600',
  },
  budgetSaveBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  budgetSaveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  budgetClearBtn: { backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  budgetClearBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  budgetAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  budgetSpentLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  budgetSpentAmt: { fontSize: 22, fontWeight: '800' },
  budgetOf: { alignItems: 'flex-end' },
  budgetOfText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  budgetRemText: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  budgetBarBg: { height: 10, backgroundColor: '#F3F4F6', borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  budgetBarFill: { height: '100%', borderRadius: 5 },
  budgetPctText: { fontSize: 12, color: '#9CA3AF', marginBottom: 10 },
  projectionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 10 },
  projectionText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  budgetEmpty: { alignItems: 'center', paddingVertical: 16 },
  budgetEmptyText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', marginTop: 8 },
  budgetEmptyHint: { fontSize: 13, color: '#D1D5DB', marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  catRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  catRankText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  catInfo: { flex: 1 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  catName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },
  catCount: { fontSize: 12, color: '#9CA3AF', marginRight: 4 },
  catPct: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginRight: 6 },
  catAmount: { fontSize: 14, fontWeight: '700', color: '#111827' },
  barBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  topTxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  topTxRank: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  topTxRankText: { fontSize: 12, fontWeight: '700' },
  topTxInfo: { flex: 1 },
  topTxDesc: { fontSize: 14, fontWeight: '600', color: '#111827' },
  topTxMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  topTxAmount: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
  salaryNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, padding: 10, backgroundColor: '#F9FAFB', borderRadius: 10 },
  salaryNoteText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, marginTop: 8 },
  barChartCol: { flex: 1, alignItems: 'center' },
  barChartVal: { fontSize: 9, color: '#9CA3AF', marginBottom: 4, textAlign: 'center' },
  barChartBarBg: { flex: 1, width: '60%', justifyContent: 'flex-end', backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barChartBarFill: { width: '100%', borderRadius: 4 },
  barChartLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  weekRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  weekLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', width: 46 },
  weekDates: { fontSize: 11, color: '#9CA3AF', width: 38 },
  weekBarBg: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  weekBarFill: { height: '100%', borderRadius: 4 },
  weekAmt: { fontSize: 13, fontWeight: '600', color: '#374151', width: 50, textAlign: 'right' },
  weekCount: { fontSize: 11, color: '#9CA3AF', width: 22, textAlign: 'right' },
  momRow: { flexDirection: 'row', alignItems: 'center' },
  momItem: { flex: 1, alignItems: 'center' },
  momItemLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 6 },
  momAmount: { fontSize: 20, fontWeight: '800' },
  momCount: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  momMiddle: { alignItems: 'center', paddingHorizontal: 16 },
  momPct: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  incomeExpRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  incomeExpLabel: { fontSize: 12, color: '#9CA3AF', width: 30, fontWeight: '500' },
  incomeExpBars: { flex: 1, gap: 4 },
  incomeExpBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  incomeExpBar: { height: 8, borderRadius: 4, minWidth: 2 },
  incomeExpBarLabel: { fontSize: 11, color: '#9CA3AF' },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#6B7280' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricBox: {
    width: '47%', backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, alignItems: 'center',
  },
  metricIcon: { fontSize: 22, marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
  metricLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
  dowChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, marginTop: 8 },
  dowCol: { flex: 1, alignItems: 'center' },
  dowVal: { fontSize: 9, color: '#9CA3AF', marginBottom: 4, textAlign: 'center' },
  dowBarBg: { flex: 1, width: '60%', justifyContent: 'flex-end', backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  dowBarFill: { width: '100%', borderRadius: 4 },
  dowLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  dowInsight: { fontSize: 12, color: '#6B7280', marginTop: 12, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 10, lineHeight: 18 },
  efficiencyGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  efficiencyItem: { flex: 1, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, gap: 6 },
  efficiencyIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  efficiencyValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  efficiencyLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
  budgetAlertBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 10, borderRadius: 10 },
  budgetAlertText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  sourceRow: { flexDirection: 'row', marginBottom: 16 },
  sourceItem: { flex: 1, alignItems: 'center', gap: 4 },
  sourceDivider: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8 },
  sourceLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  sourceValue: { fontSize: 17, fontWeight: '800', color: '#111827' },
  sourceCount: { fontSize: 12, color: '#9CA3AF' },
  sourceBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  sourceBarSms: { backgroundColor: '#6366F1' },
  sourceBarManual: { backgroundColor: '#10B981' },
  sourcePctText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { color: '#9CA3AF', marginTop: 10, fontSize: 14 },
});

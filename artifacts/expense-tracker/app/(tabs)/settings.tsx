import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  Platform,
  Modal,
  StatusBar,
  Share,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  Category, getCategories, addCategory, updateCategory, deleteCategory,
  CategoryRule, getCategoryRules, addCategoryRule, deleteCategoryRule,
  createBackup, restoreBackup, BackupData,
  deleteTransactionsByMonth, deleteAllTransactions, getAvailableMonths,
  getSourceTransactionBalance,
} from '../../lib/database';
import { getPaymentSources, addPaymentSource, removePaymentSource } from '../../lib/paymentSources';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CategoryForm from '../../components/CategoryForm';
import { useTheme, setThemeMode, ThemeMode } from '../../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REMINDER_KEY = 'evening_reminder';
const LOCK_ENABLED_KEY = 'app_lock_enabled';
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

const EVENING_HOURS = [
  { label: '6:00 PM', hour: '18', minute: '00' },
  { label: '6:30 PM', hour: '18', minute: '30' },
  { label: '7:00 PM', hour: '19', minute: '00' },
  { label: '7:30 PM', hour: '19', minute: '30' },
  { label: '8:00 PM', hour: '20', minute: '00' },
  { label: '8:30 PM', hour: '20', minute: '30' },
  { label: '9:00 PM', hour: '21', minute: '00' },
  { label: '9:30 PM', hour: '21', minute: '30' },
  { label: '10:00 PM', hour: '22', minute: '00' },
];

type BalanceMode = 'opening' | 'current';

function getOpeningBalanceKey(source: string) {
  return `source_ob_${source}`;
}

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AccordionSection({
  title,
  subtitle,
  count,
  open,
  onToggle,
  children,
  colors,
  rightElement,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  colors: any;
  rightElement?: React.ReactNode;
}) {
  return (
    <View style={[accordionStyles.wrapper, { backgroundColor: colors.card }]}>
      <TouchableOpacity
        style={accordionStyles.header}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={accordionStyles.headerLeft}>
          <Text style={[accordionStyles.headerTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && !open && (
            <Text style={[accordionStyles.headerSub, { color: colors.textFaint }]}>{subtitle}</Text>
          )}
        </View>
        <View style={accordionStyles.headerRight}>
          {rightElement}
          {count !== undefined && (
            <View style={[accordionStyles.countBadge, { backgroundColor: colors.primaryBg }]}>
              <Text style={[accordionStyles.countText, { color: colors.primary }]}>{count}</Text>
            </View>
          )}
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
        </View>
      </TouchableOpacity>
      {open && (
        <View style={[accordionStyles.body, { borderTopColor: colors.border }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const accordionStyles = StyleSheet.create({
  wrapper: { borderRadius: 14, marginHorizontal: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '700' },
  body: { borderTopWidth: 1, paddingHorizontal: 16, paddingBottom: 16 },
});

export default function SettingsScreen() {
  const { colors, themeMode } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentSources, setPaymentSources] = useState<string[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const [currentBalanceInputs, setCurrentBalanceInputs] = useState<Record<string, string>>({});
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('opening');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState('20');
  const [reminderMinute, setReminderMinute] = useState('00');
  const [newSource, setNewSource] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJson, setRestoreJson] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sources: false,
    balances: false,
    categories: false,
    rules: false,
  });

  const toggleSection = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = useCallback(async () => {
    try { setCategories(getCategories()); } catch {}
    try { setRules(getCategoryRules()); } catch {}
    try { setAvailableMonths(getAvailableMonths()); } catch {}
    try {
      const lv = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
      setLockEnabled(lv === 'true');
    } catch {}
    try {
      const sources = await getPaymentSources();
      setPaymentSources(sources);
      const bals: Record<string, string> = {};
      for (const s of sources) {
        const val = await AsyncStorage.getItem(getOpeningBalanceKey(s));
        bals[s] = val ?? '';
      }
      setOpeningBalances(bals);
    } catch {}
    try {
      const rem = await AsyncStorage.getItem(REMINDER_KEY);
      if (rem) {
        const { enabled, hour, minute } = JSON.parse(rem);
        setReminderEnabled(enabled ?? false);
        setReminderHour(hour ?? '20');
        setReminderMinute(minute ?? '00');
      }
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const saveReminder = async (enabled: boolean, hour: string, minute: string) => {
    await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled, hour, minute }));
    if (Platform.OS === 'web') return;
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.requestPermissionsAsync();
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (enabled) {
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Log your expenses', body: "Time to record today's transactions!", sound: true },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parseInt(hour),
            minute: parseInt(minute),
          },
        });
      }
    } catch {}
  };

  const handleToggleReminder = async (value: boolean) => {
    setReminderEnabled(value);
    await saveReminder(value, reminderHour, reminderMinute);
  };

  const handleSelectTime = async (hour: string, minute: string) => {
    setReminderHour(hour);
    setReminderMinute(minute);
    if (reminderEnabled) await saveReminder(true, hour, minute);
  };

  const selectedTimeLabel = EVENING_HOURS.find(t => t.hour === reminderHour && t.minute === reminderMinute)?.label ?? `${reminderHour}:${reminderMinute}`;

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const backup = createBackup();
      const json = JSON.stringify(backup, null, 2);
      await Share.share({ message: json, title: `ExpenseTracker Backup — ${backup.transactions.length} transactions` });
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message ?? 'Could not create backup.');
    } finally {
      setBackingUp(false);
    }
  };

  const confirmRestore = () => {
    if (!restoreJson.trim()) { Alert.alert('Empty', 'Please paste your backup JSON first.'); return; }
    let data: BackupData;
    try { data = JSON.parse(restoreJson.trim()); } catch {
      Alert.alert('Invalid JSON', 'The pasted text is not valid JSON.');
      return;
    }
    Alert.alert(
      'Restore Backup',
      `This will add ${data.transactions?.length ?? 0} transactions. Existing data will NOT be deleted — duplicates are skipped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = restoreBackup(data);
              setShowRestoreModal(false);
              Alert.alert('Restore Complete', `Added ${result.inserted} new transactions.${result.skipped > 0 ? ` ${result.skipped} skipped.` : ''}`);
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message ?? 'Unknown error');
            } finally {
              setRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleAddCategory = (name: string, icon: string, color: string) => {
    try { addCategory({ name, icon, color, isDefault: false }); } catch {}
    setShowNewCatForm(false);
    setCategories(getCategories());
  };

  const handleEditCategory = (name: string, icon: string, color: string) => {
    if (!editingCat) return;
    try { updateCategory(editingCat.id, { name, icon, color }); } catch {}
    setEditingCat(null);
    setCategories(getCategories());
  };

  const handleDeleteCategory = (cat: Category) => {
    const isBuiltIn = !!cat.isDefault;
    Alert.alert(
      isBuiltIn ? 'Delete Built-in Category?' : 'Delete Category',
      isBuiltIn
        ? `"${cat.name}" is a built-in category. Existing transactions using it will show "Uncategorised". Are you sure?`
        : `Delete "${cat.name}"? Existing transactions using it will show "Uncategorised".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            try { deleteCategory(cat.id); } catch {}
            setCategories(getCategories());
          },
        },
      ]
    );
  };

  const handleAddSource = async () => {
    if (!newSource.trim()) return;
    const updated = await addPaymentSource(newSource.trim());
    setPaymentSources(updated);
    setNewSource('');
    const bals = { ...openingBalances };
    bals[newSource.trim()] = '';
    setOpeningBalances(bals);
  };

  const handleRemoveSource = async (source: string) => {
    Alert.alert('Remove Source', `Remove "${source}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = await removePaymentSource(source);
          setPaymentSources(updated);
          await AsyncStorage.removeItem(getOpeningBalanceKey(source));
          const bals = { ...openingBalances };
          delete bals[source];
          setOpeningBalances(bals);
        },
      },
    ]);
  };

  const handleSaveOpeningBalance = async (source: string) => {
    let obValue: number;
    if (balanceMode === 'opening') {
      const val = openingBalances[source] ?? '';
      const num = parseFloat(val);
      if (val !== '' && (isNaN(num) || num < 0)) {
        Alert.alert('Invalid Amount', 'Please enter a valid non-negative amount.');
        return;
      }
      obValue = isNaN(num) ? 0 : num;
    } else {
      const cbVal = currentBalanceInputs[source] ?? '';
      const currentBalance = parseFloat(cbVal);
      if (isNaN(currentBalance)) {
        Alert.alert('Invalid Amount', 'Please enter your current account balance.');
        return;
      }
      const txBal = getSourceTransactionBalance(source);
      const netTx = txBal.credits - txBal.debits + txBal.transferIn - txBal.transferOut;
      obValue = currentBalance - netTx;
    }
    await AsyncStorage.setItem(getOpeningBalanceKey(source), obValue.toString());
    setOpeningBalances(prev => ({ ...prev, [source]: obValue.toString() }));
    Alert.alert('Saved', `Opening balance for ${source} set to ${fmt(obValue)}.`);
  };

  const getComputedOpeningBalance = (source: string): number | null => {
    const cbVal = currentBalanceInputs[source] ?? '';
    const currentBalance = parseFloat(cbVal);
    if (isNaN(currentBalance)) return null;
    const txBal = getSourceTransactionBalance(source);
    const netTx = txBal.credits - txBal.debits + txBal.transferIn - txBal.transferOut;
    return currentBalance - netTx;
  };

  const handleToggleLock = async (enable: boolean) => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'App Lock is only available on Android and iOS devices.');
      return;
    }
    if (enable) {
      try {
        const LocalAuth = await import('expo-local-authentication');
        const hasHardware = await LocalAuth.hasHardwareAsync();
        const isEnrolled = await LocalAuth.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          Alert.alert('Not Available', 'Your device does not have biometrics or a screen lock set up. Please set one up in your phone settings first.');
          return;
        }
        const result = await LocalAuth.authenticateAsync({ promptMessage: 'Confirm to enable App Lock', cancelLabel: 'Cancel', disableDeviceFallback: false });
        if (!result.success) return;
      } catch {
        Alert.alert('Error', 'Could not verify authentication. Please try again.');
        return;
      }
    }
    await AsyncStorage.setItem(LOCK_ENABLED_KEY, enable ? 'true' : 'false');
    setLockEnabled(enable);
    if (!enable) Alert.alert('App Lock Disabled', 'The app will no longer ask for authentication when opened.');
  };

  const handleAddRule = () => {
    const pattern = newRulePattern.trim();
    const category = newRuleCategory.trim();
    if (!pattern || !category) { Alert.alert('Missing Fields', 'Enter both a keyword and a category.'); return; }
    addCategoryRule(pattern, category);
    setRules(getCategoryRules());
    setNewRulePattern('');
    setNewRuleCategory('');
  };

  const handleDeleteRule = (rule: CategoryRule) => {
    Alert.alert('Delete Rule', `Remove rule: "${rule.pattern}" → ${rule.category}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteCategoryRule(rule.id); setRules(getCategoryRules()); } },
    ]);
  };

  const handleDeleteByMonth = (month: string) => {
    const label = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    Alert.alert(
      `Clear ${label}`,
      `This will permanently delete all transactions recorded in ${label}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            deleteTransactionsByMonth(month);
            setAvailableMonths(getAvailableMonths());
            Alert.alert('Done', `All transactions for ${label} have been deleted.`);
          },
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete All Transactions',
      'This will permanently erase ALL your transaction history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive', onPress: () => {
            Alert.alert('Are you absolutely sure?', 'All data will be lost permanently.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything', style: 'destructive', onPress: () => {
                    deleteAllTransactions();
                    setAvailableMonths([]);
                    Alert.alert('Cleared', 'All transactions have been deleted.');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'Light', icon: 'sun' },
    { mode: 'dark', label: 'Dark', icon: 'moon' },
    { mode: 'system', label: 'System', icon: 'smartphone' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} showsVerticalScrollIndicator={false}>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Appearance</Text>
        <View style={[styles.plainCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardLabel, { color: colors.text }]}>Theme</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>Choose how the app looks</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.themeBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }, themeMode === opt.mode && { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
                onPress={() => setThemeMode(opt.mode)}
              >
                <Feather name={opt.icon as any} size={18} color={themeMode === opt.mode ? colors.primary : colors.textMuted} />
                <Text style={[styles.themeBtnText, { color: themeMode === opt.mode ? colors.primary : colors.textSub }]}>{opt.label}</Text>
                {themeMode === opt.mode && (
                  <View style={[styles.themeCheck, { backgroundColor: colors.primary }]}>
                    <Feather name="check" size={10} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Security</Text>
        <View style={[styles.plainCard, { backgroundColor: colors.card }]}>
          <View style={styles.lockRow}>
            <View style={[styles.lockIconWrap, { backgroundColor: lockEnabled ? colors.primaryBg : colors.cardAlt }]}>
              <Feather name={lockEnabled ? 'lock' : 'unlock'} size={20} color={lockEnabled ? colors.primary : colors.textFaint} />
            </View>
            <View style={styles.lockInfo}>
              <Text style={[styles.lockLabel, { color: colors.text }]}>App Lock</Text>
              <Text style={[styles.lockSub, { color: colors.textFaint }]}>
                {Platform.OS === 'web'
                  ? 'Available on Android & iOS only'
                  : lockEnabled
                  ? 'App locks when sent to background'
                  : 'Use your fingerprint, Face ID, or phone PIN'}
              </Text>
            </View>
            <Switch
              value={lockEnabled}
              onValueChange={handleToggleLock}
              trackColor={{ false: colors.border, true: colors.primaryBorder }}
              thumbColor={lockEnabled ? colors.primary : colors.textFaint}
              disabled={Platform.OS === 'web'}
            />
          </View>
          {lockEnabled && (
            <View style={[styles.lockActiveBox, { backgroundColor: colors.primaryBg }]}>
              <Feather name="shield" size={13} color={colors.primary} />
              <Text style={[styles.lockActiveText, { color: colors.primary }]}>
                The app will ask for your phone's authentication each time it's reopened from the background.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Payment Sources</Text>
        <AccordionSection
          title="Your Accounts"
          subtitle={paymentSources.length === 0 ? 'No sources added yet' : paymentSources.join(', ')}
          count={paymentSources.length}
          open={openSections.sources}
          onToggle={() => toggleSection('sources')}
          colors={colors}
        >
          {paymentSources.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>No payment sources yet. Add one below.</Text>
          ) : (
            paymentSources.map(source => (
              <View key={source} style={[styles.sourceItem, { borderBottomColor: colors.divider }]}>
                <View style={[styles.sourceIcon, { backgroundColor: colors.primaryBg }]}>
                  <Feather name="credit-card" size={14} color={colors.primary} />
                </View>
                <Text style={[styles.sourceName, { color: colors.text }]}>{source}</Text>
                <TouchableOpacity style={[styles.removeBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleRemoveSource(source)}>
                  <Feather name="trash-2" size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={styles.addSourceRow}>
            <TextInput
              style={[styles.sourceInput, { backgroundColor: colors.inputBg, color: colors.inputText }]}
              value={newSource}
              onChangeText={setNewSource}
              placeholder="Add source (e.g. SBI, Cash, UPI)"
              placeholderTextColor={colors.placeholder}
              onSubmitEditing={handleAddSource}
            />
            <TouchableOpacity style={[styles.addSourceBtn, { backgroundColor: colors.primary }]} onPress={handleAddSource}>
              <Feather name="plus" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </AccordionSection>
      </View>

      {paymentSources.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Opening Balances</Text>
          <AccordionSection
            title="Account Balances"
            subtitle="Tap to set starting or current balance"
            open={openSections.balances}
            onToggle={() => toggleSection('balances')}
            colors={colors}
          >
            <View style={[styles.modeToggleWrap, { backgroundColor: colors.cardAlt }]}>
              <TouchableOpacity
                style={[styles.modeBtn, balanceMode === 'opening' && { backgroundColor: colors.card }]}
                onPress={() => setBalanceMode('opening')}
              >
                <Feather name="rewind" size={13} color={balanceMode === 'opening' ? colors.primary : colors.textFaint} />
                <Text style={[styles.modeBtnText, { color: balanceMode === 'opening' ? colors.primary : colors.textFaint }, balanceMode === 'opening' && { fontWeight: '700' }]}>
                  Balance Before
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, balanceMode === 'current' && { backgroundColor: colors.card }]}
                onPress={() => setBalanceMode('current')}
              >
                <Feather name="clock" size={13} color={balanceMode === 'current' ? colors.primary : colors.textFaint} />
                <Text style={[styles.modeBtnText, { color: balanceMode === 'current' ? colors.primary : colors.textFaint }, balanceMode === 'current' && { fontWeight: '700' }]}>
                  Current Balance
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modeHint, { color: colors.textFaint }]}>
              {balanceMode === 'opening'
                ? 'Enter the balance this account had before you started tracking expenses here.'
                : 'Enter what the account shows right now — we\'ll work backwards to find the opening balance.'}
            </Text>

            {paymentSources.map(source => {
              const computedOb = balanceMode === 'current' ? getComputedOpeningBalance(source) : null;
              const savedOb = parseFloat(openingBalances[source] ?? '0') || 0;
              return (
                <View key={source} style={[styles.obBlock, { borderBottomColor: colors.border }]}>
                  <View style={styles.obHeaderRow}>
                    <View style={[styles.obIcon, { backgroundColor: colors.primaryBg }]}>
                      <Feather name="credit-card" size={13} color={colors.primary} />
                    </View>
                    <Text style={[styles.obSource, { color: colors.text }]}>{source}</Text>
                    {openingBalances[source] ? (
                      <Text style={[styles.obSaved, { color: colors.textFaint }]}>OB: {fmt(savedOb)}</Text>
                    ) : null}
                  </View>

                  <View style={styles.obInputRow}>
                    <View style={[styles.obInputWrap, { backgroundColor: colors.inputBg, flex: 1 }]}>
                      <Text style={[styles.obRupee, { color: colors.textFaint }]}>₹</Text>
                      {balanceMode === 'opening' ? (
                        <TextInput
                          style={[styles.obInput, { color: colors.inputText }]}
                          value={openingBalances[source] ?? ''}
                          onChangeText={val => setOpeningBalances(prev => ({ ...prev, [source]: val }))}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor={colors.placeholder}
                        />
                      ) : (
                        <TextInput
                          style={[styles.obInput, { color: colors.inputText }]}
                          value={currentBalanceInputs[source] ?? ''}
                          onChangeText={val => setCurrentBalanceInputs(prev => ({ ...prev, [source]: val }))}
                          keyboardType="decimal-pad"
                          placeholder="Enter current balance"
                          placeholderTextColor={colors.placeholder}
                        />
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.obSaveBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleSaveOpeningBalance(source)}
                    >
                      <Feather name="check" size={15} color="#FFFFFF" />
                      <Text style={styles.obSaveBtnText}>Save</Text>
                    </TouchableOpacity>
                  </View>

                  {balanceMode === 'current' && computedOb !== null && (
                    <View style={[styles.computedRow, { backgroundColor: colors.primaryBg }]}>
                      <Feather name="info" size={12} color={colors.primary} />
                      <Text style={[styles.computedText, { color: colors.primary }]}>
                        Opening balance will be set to {fmt(computedOb)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </AccordionSection>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Data Management</Text>
        <View style={[styles.plainCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardLabel, { color: colors.text }]}>Clear Data by Month</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            Delete all transactions for a specific month. Use this to fix opening balances or remove test data. This cannot be undone.
          </Text>
          {availableMonths.length === 0 ? (
            <View style={[styles.dmEmpty, { backgroundColor: colors.cardAlt }]}>
              <Text style={[styles.dmEmptyText, { color: colors.textFaint }]}>No transactions recorded yet.</Text>
            </View>
          ) : (
            availableMonths.map(month => {
              const label = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
              return (
                <View key={month} style={[styles.monthRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.monthIcon, { backgroundColor: colors.warningBg }]}>
                    <Feather name="calendar" size={14} color={colors.warning} />
                  </View>
                  <Text style={[styles.monthLabel, { color: colors.text }]}>{label}</Text>
                  <TouchableOpacity style={[styles.monthDeleteBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDeleteByMonth(month)}>
                    <Feather name="trash-2" size={14} color={colors.danger} />
                    <Text style={[styles.monthDeleteText, { color: colors.danger }]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          <TouchableOpacity style={[styles.deleteAllBtn, { borderColor: colors.danger }]} onPress={handleDeleteAll}>
            <Feather name="alert-triangle" size={15} color={colors.danger} />
            <Text style={[styles.deleteAllText, { color: colors.danger }]}>Delete All Transactions</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Data Backup & Restore</Text>
        <View style={[styles.plainCard, { backgroundColor: colors.card }]}>
          <View style={styles.backupRow}>
            <View style={[styles.backupIconWrap, { backgroundColor: colors.primaryBg }]}>
              <Feather name="database" size={22} color={colors.primary} />
            </View>
            <View style={styles.backupInfo}>
              <Text style={[styles.backupTitle, { color: colors.text }]}>Backup your data</Text>
              <Text style={[styles.backupSub, { color: colors.textMuted }]}>Export all transactions as JSON. Save to Drive or email to yourself.</Text>
            </View>
          </View>
          <View style={styles.backupBtns}>
            <TouchableOpacity style={[styles.backupBtn, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]} onPress={handleBackup} disabled={backingUp}>
              <Feather name="upload" size={16} color={colors.primary} />
              <Text style={[styles.backupBtnText, { color: colors.primary }]}>{backingUp ? 'Preparing...' : 'Export Backup'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupBtn, { backgroundColor: colors.successBg, borderColor: colors.success }]} onPress={() => { setRestoreJson(''); setShowRestoreModal(true); }}>
              <Feather name="download" size={16} color={colors.success} />
              <Text style={[styles.backupBtnText, { color: colors.success }]}>Restore</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.backupNote, { color: colors.textFaint }]}>To transfer to a new phone: export → save the file → open Expense Tracker on the new phone → paste JSON in Restore.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Evening Reminder</Text>
        <View style={[styles.plainCard, { backgroundColor: colors.card }]}>
          <View style={styles.reminderToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reminderLabel, { color: colors.text }]}>Daily Expense Reminder</Text>
              <Text style={[styles.reminderSub, { color: colors.textFaint }]}>
                {reminderEnabled ? `Notifying at ${selectedTimeLabel}` : 'Get notified to log expenses every evening'}
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ false: colors.border, true: colors.primaryBorder }}
              thumbColor={reminderEnabled ? colors.primary : colors.textFaint}
            />
          </View>
          {reminderEnabled && (
            <>
              <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.timePickerLabel, { color: colors.textFaint }]}>Choose reminder time</Text>
              <View style={styles.timeChips}>
                {EVENING_HOURS.map(opt => {
                  const sel = reminderHour === opt.hour && reminderMinute === opt.minute;
                  return (
                    <TouchableOpacity
                      key={`${opt.hour}:${opt.minute}`}
                      style={[styles.timeChip, { backgroundColor: sel ? colors.primary : colors.cardAlt }]}
                      onPress={() => handleSelectTime(opt.hour, opt.minute)}
                    >
                      <Text style={[styles.timeChipText, { color: sel ? '#FFFFFF' : colors.textSub }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Categories</Text>
        <AccordionSection
          title="Spending Categories"
          subtitle={`${categories.length} categories`}
          count={categories.length}
          open={openSections.categories}
          onToggle={() => { toggleSection('categories'); setShowNewCatForm(false); setEditingCat(null); }}
          colors={colors}
          rightElement={
            openSections.categories ? (
              <TouchableOpacity
                style={[styles.addCatBtn, { backgroundColor: colors.primaryBg }]}
                onPress={() => { setShowNewCatForm(!showNewCatForm); setEditingCat(null); }}
              >
                <Feather name={showNewCatForm ? 'x' : 'plus'} size={13} color={colors.primary} />
                <Text style={[styles.addCatBtnText, { color: colors.primary }]}>{showNewCatForm ? 'Cancel' : 'Add'}</Text>
              </TouchableOpacity>
            ) : undefined
          }
        >
          {showNewCatForm && (
            <View style={[styles.newCatBox, { backgroundColor: colors.cardAlt, borderColor: colors.primaryBorder }]}>
              <Text style={[styles.formHeading, { color: colors.text }]}>New Category</Text>
              <CategoryForm onSave={handleAddCategory} onCancel={() => setShowNewCatForm(false)} saveLabel="Create Category" />
            </View>
          )}
          {categories.map(cat => (
            <View key={cat.id}>
              {editingCat?.id === cat.id ? (
                <View style={[styles.catEditBox, { backgroundColor: colors.cardAlt, borderColor: colors.primaryBorder }]}>
                  <CategoryForm
                    initialName={cat.name}
                    initialIcon={cat.icon}
                    initialColor={cat.color}
                    onSave={handleEditCategory}
                    onCancel={() => setEditingCat(null)}
                    saveLabel="Save Changes"
                  />
                </View>
              ) : (
                <View style={[styles.catRow, { borderBottomColor: colors.divider }]}>
                  <View style={[styles.catIcon, { backgroundColor: (cat.color || '#6B7280') + '22' }]}>
                    <Feather name={(cat.icon || 'more-horizontal') as any} size={16} color={cat.color || '#6B7280'} />
                  </View>
                  <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
                  {!!cat.isDefault && (
                    <View style={[styles.builtInBadge, { backgroundColor: colors.cardAlt }]}>
                      <Text style={[styles.builtInBadgeText, { color: colors.textFaint }]}>built-in</Text>
                    </View>
                  )}
                  <View style={styles.catActions}>
                    <TouchableOpacity style={[styles.catActionBtn, { backgroundColor: colors.primaryBg }]} onPress={() => { setEditingCat(cat); setShowNewCatForm(false); }}>
                      <Feather name="edit-2" size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.catActionBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDeleteCategory(cat)}>
                      <Feather name="trash-2" size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </AccordionSection>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>Auto-Category Rules</Text>
        <AccordionSection
          title="Keyword Rules"
          subtitle={rules.length === 0 ? 'No rules yet — tap to add' : `${rules.length} rule${rules.length !== 1 ? 's' : ''} active`}
          count={rules.length > 0 ? rules.length : undefined}
          open={openSections.rules}
          onToggle={() => toggleSection('rules')}
          colors={colors}
        >
          <Text style={[styles.cardSub, { color: colors.textMuted, marginTop: 8 }]}>
            When a transaction description contains the keyword, it's automatically assigned that category on SMS import.
          </Text>
          {rules.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textFaint }]}>No rules yet. Add one below.</Text>
          ) : (
            rules.map(rule => (
              <View key={rule.id} style={[styles.ruleRow, { borderBottomColor: colors.divider }]}>
                <View style={[styles.rulePatternBadge, { backgroundColor: colors.primaryBg }]}>
                  <Text style={[styles.rulePatternText, { color: colors.primary }]}>{rule.pattern}</Text>
                </View>
                <Feather name="arrow-right" size={13} color={colors.textFaint} style={{ marginHorizontal: 6 }} />
                <Text style={[styles.ruleCategoryText, { color: colors.text }]} numberOfLines={1}>{rule.category}</Text>
                <TouchableOpacity style={[styles.catActionBtn, { backgroundColor: colors.dangerBg, marginLeft: 'auto' }]} onPress={() => handleDeleteRule(rule)}>
                  <Feather name="trash-2" size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={[styles.ruleAddBox, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <Text style={[styles.ruleAddLabel, { color: colors.textSub }]}>New Rule</Text>
            <TextInput
              style={[styles.ruleInput, { backgroundColor: colors.inputBg, color: colors.inputText }]}
              value={newRulePattern}
              onChangeText={setNewRulePattern}
              placeholder="Keyword (e.g. Zomato, Amazon)"
              placeholderTextColor={colors.placeholder}
            />
            <Text style={[styles.ruleArrow, { color: colors.textFaint }]}>→ Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ruleCatScroll} contentContainerStyle={styles.ruleCatChips}>
              {categories.map(cat => {
                const selected = newRuleCategory === cat.name;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.ruleCatChip, { backgroundColor: selected ? colors.primary : colors.cardAlt, borderColor: selected ? colors.primary : colors.border }]}
                    onPress={() => setNewRuleCategory(cat.name)}
                  >
                    <View style={[styles.ruleCatDot, { backgroundColor: selected ? '#FFFFFF' : (cat.color || '#6B7280') }]} />
                    <Text style={[styles.ruleCatChipText, { color: selected ? '#FFFFFF' : colors.textSub }]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.addSourceBtn, { backgroundColor: newRulePattern && newRuleCategory ? colors.primary : colors.cardAlt, marginTop: 10 }]}
              onPress={handleAddRule}
            >
              <Feather name="plus" size={16} color={newRulePattern && newRuleCategory ? '#FFFFFF' : colors.textFaint} />
              <Text style={[styles.addRuleBtnText, { color: newRulePattern && newRuleCategory ? '#FFFFFF' : colors.textFaint }]}>Add Rule</Text>
            </TouchableOpacity>
          </View>
        </AccordionSection>
      </View>

      <View style={{ height: 60 }} />

      <Modal visible={showRestoreModal} animationType="slide" transparent onRequestClose={() => setShowRestoreModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowRestoreModal(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.bottomSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.bottomSheetTitle, { color: colors.text }]}>Restore from Backup</Text>
            <Text style={[styles.bottomSheetSub, { color: colors.textMuted }]}>Paste your backup JSON below. Existing transactions are kept — duplicates are skipped.</Text>
            <TextInput
              style={[styles.jsonInput, { backgroundColor: colors.inputBg, color: colors.inputText, borderColor: colors.border }]}
              value={restoreJson}
              onChangeText={setRestoreJson}
              placeholder="Paste backup JSON here..."
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.bottomSheetBtns}>
              <TouchableOpacity style={[styles.bottomSheetBtn, { backgroundColor: colors.cardAlt }]} onPress={() => setShowRestoreModal(false)}>
                <Text style={[styles.bottomSheetBtnText, { color: colors.textSub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bottomSheetBtn, { backgroundColor: colors.primary }]} onPress={confirmRestore} disabled={restoring}>
                <Text style={[styles.bottomSheetBtnText, { color: '#FFFFFF' }]}>{restoring ? 'Restoring...' : 'Restore'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  plainCard: { marginHorizontal: 12, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  cardSub: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 6, borderWidth: 1.5, position: 'relative' },
  themeBtnText: { fontSize: 13, fontWeight: '600' },
  themeCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sourceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, gap: 10 },
  sourceIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sourceName: { flex: 1, fontSize: 15, fontWeight: '500' },
  removeBtn: { padding: 8, borderRadius: 8 },
  addSourceRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sourceInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addSourceBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeToggleWrap: { flexDirection: 'row', borderRadius: 10, padding: 3, marginTop: 4, marginBottom: 10 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  modeBtnText: { fontSize: 13, fontWeight: '500' },
  modeHint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  obBlock: { paddingVertical: 12, borderBottomWidth: 1 },
  obHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  obIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  obSource: { flex: 1, fontSize: 14, fontWeight: '600' },
  obSaved: { fontSize: 12 },
  obInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  obInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, gap: 4 },
  obRupee: { fontSize: 14, fontWeight: '600' },
  obInput: { flex: 1, fontSize: 14, fontWeight: '600', minWidth: 60 },
  obSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  obSaveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  computedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 },
  computedText: { fontSize: 12, fontWeight: '500', flex: 1 },
  dmEmpty: { borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  dmEmptyText: { fontSize: 13 },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, gap: 10 },
  monthIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  monthDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  monthDeleteText: { fontSize: 13, fontWeight: '600' },
  deleteAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5 },
  deleteAllText: { fontSize: 14, fontWeight: '700' },
  backupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  backupIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  backupInfo: { flex: 1 },
  backupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  backupSub: { fontSize: 13, lineHeight: 18 },
  backupBtns: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  backupBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1 },
  backupBtnText: { fontSize: 14, fontWeight: '600' },
  backupNote: { fontSize: 12, lineHeight: 18 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderLabel: { fontSize: 15, fontWeight: '600' },
  reminderSub: { fontSize: 13, marginTop: 2 },
  timeDivider: { height: 1, marginVertical: 14 },
  timePickerLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  timeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  timeChipText: { fontSize: 13, fontWeight: '500' },
  addCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addCatBtnText: { fontSize: 12, fontWeight: '600' },
  newCatBox: { borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1 },
  formHeading: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  catEditBox: { borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, gap: 10 },
  catIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catName: { flex: 1, fontSize: 14, fontWeight: '500' },
  builtInBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  builtInBadgeText: { fontSize: 10, fontWeight: '600' },
  catActions: { flexDirection: 'row', gap: 6 },
  catActionBtn: { padding: 7, borderRadius: 8 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lockIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lockInfo: { flex: 1 },
  lockLabel: { fontSize: 15, fontWeight: '600' },
  lockSub: { fontSize: 13, marginTop: 2 },
  lockActiveBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 10, padding: 10, marginTop: 14 },
  lockActiveText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  bottomSheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  bottomSheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  bottomSheetSub: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  jsonInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 13, minHeight: 160, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 16 },
  bottomSheetBtns: { flexDirection: 'row', gap: 10 },
  bottomSheetBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  bottomSheetBtnText: { fontSize: 15, fontWeight: '700' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1 },
  rulePatternBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rulePatternText: { fontSize: 13, fontWeight: '700' },
  ruleCategoryText: { flex: 1, fontSize: 13, fontWeight: '500' },
  ruleAddBox: { borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1 },
  ruleAddLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  ruleInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  ruleArrow: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  ruleCatScroll: { flexGrow: 0, marginBottom: 4 },
  ruleCatChips: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  ruleCatChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  ruleCatDot: { width: 7, height: 7, borderRadius: 3.5 },
  ruleCatChipText: { fontSize: 12, fontWeight: '500' },
  addRuleBtnText: { fontSize: 14, fontWeight: '700' },
});

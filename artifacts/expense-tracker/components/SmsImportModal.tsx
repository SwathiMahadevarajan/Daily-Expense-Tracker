import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
  Platform,
  PermissionsAndroid,
  StatusBar,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { parseSmsMessage, processSmsChunk, ParsedSmsTransaction } from '../lib/smsParser';
import { getImportedSmsIds, bulkInsertSmsTransactions, recordImportedSmsIds } from '../lib/database';
import { readSms, getSmsAndroidModule } from '../lib/smsAndroid';
import { useTheme } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImportComplete: (count: number) => void;
}

interface SmsResult extends ParsedSmsTransaction {
  selected: boolean;
}

type Stage = 'idle' | 'scanning' | 'review' | 'done';
type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'all';

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'all', label: 'All (1000 SMS)' },
];

const CHUNK_SIZE = 50;
const MAX_SMS = 1000;
const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

function getDateRangeFilter(range: DateRange): { minTs: number; maxTs: number } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000 - 1;
  switch (range) {
    case 'today': return { minTs: todayStart, maxTs: todayEnd };
    case 'yesterday': return { minTs: todayStart - 86400000, maxTs: todayStart - 1 };
    case 'week': return { minTs: todayStart - 6 * 86400000, maxTs: todayEnd };
    case 'month': return { minTs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), maxTs: todayEnd };
    case 'last_month': return {
      minTs: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
      maxTs: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime(),
    };
    default: return { minTs: 0, maxTs: Date.now() + 86400000 };
  }
}

export default function SmsImportModal({ visible, onClose, onImportComplete }: Props) {
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [smsRead, setSmsRead] = useState(0);
  const [bankSmsFound, setBankSmsFound] = useState(0);
  const [results, setResults] = useState<SmsResult[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateProgress = (value: number) => {
    Animated.timing(progressAnim, { toValue: value, duration: 300, useNativeDriver: false }).start();
    setProgress(value);
  };

  const handleClose = () => {
    setStage('idle'); setProgress(0); setSmsRead(0); setBankSmsFound(0);
    setResults([]); setImportedCount(0); progressAnim.setValue(0); onClose();
  };

  const startScan = async () => {
    if (Platform.OS !== 'android') { Alert.alert('Not Supported', 'SMS Import is only available on Android devices.'); return; }
    if (isExpoGo()) {
      Alert.alert('Full Build Required', 'SMS Import requires the full APK build and is not available in Expo Go.\n\nBuild the APK using:\neas build --platform android --profile preview', [{ text: 'OK' }]);
      return;
    }
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'SMS Permission Required',
        message: 'Expense Tracker needs to read your SMS messages to import bank transactions. Only financial SMS from banks will be processed. No data leaves your phone.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'Allow',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) { Alert.alert('Permission Denied', 'SMS permission is required to import bank transactions.'); return; }
    } catch { Alert.alert('Error', 'Failed to request SMS permission.'); return; }

    setStage('scanning'); setSmsRead(0); setBankSmsFound(0); setResults([]); animateProgress(0);

    if (!getSmsAndroidModule()) {
      Alert.alert('Module Not Available', 'SMS reading requires the full APK build via EAS Build.\n\nRun: eas build --platform android --profile preview', [{ text: 'OK' }]);
      setStage('idle'); return;
    }

    const importedIds = getImportedSmsIds();
    const newResults: SmsResult[] = [];
    let totalRead = 0;
    let totalBankSms = 0;
    const { minTs, maxTs } = getDateRangeFilter(dateRange);

    try {
      const rawMessages = await readSms({ box: 'inbox', maxCount: MAX_SMS });
      const filtered = rawMessages.filter((sms: any) => {
        const ts = typeof sms.date === 'number' ? sms.date : parseInt(sms.date);
        return ts >= minTs && ts <= maxTs;
      });
      const chunks: any[][] = [];
      for (let i = 0; i < filtered.length; i += CHUNK_SIZE) chunks.push(filtered.slice(i, i + CHUNK_SIZE));

      for (const chunk of chunks) {
        const { parsed, bankSmsCount } = processSmsChunk(chunk, importedIds);
        totalRead += chunk.length;
        totalBankSms += bankSmsCount;
        for (const p of parsed) {
          if (!p.alreadyImported) {
            newResults.push({ ...p, selected: true });
          }
        }
        setSmsRead(totalRead);
        setBankSmsFound(totalBankSms);
        animateProgress(Math.min((totalRead / Math.max(filtered.length, 1)) * 100, 100));
        await new Promise(r => setTimeout(r, 10));
      }
      if (filtered.length === 0) setSmsRead(rawMessages.length);
    } catch (err: any) {
      Alert.alert('SMS Read Error', err.message ?? 'Unknown error reading SMS.');
      setStage('idle'); return;
    }

    setResults(newResults);
    setStage('review');
    animateProgress(100);
  };

  const toggleSelect = (index: number) => setResults(prev =>
    prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item)
  );

  const selectAll = () => setResults(prev => prev.map(item => ({ ...item, selected: true })));
  const deselectAll = () => setResults(prev => prev.map(item => ({ ...item, selected: false })));

  const handleImport = () => {
    const toImport = results
      .filter(r => r.selected)
      .map(r => ({
        amount: r.amount,
        type: r.type,
        category: r.type === 'credit' ? 'Income' : 'Other',
        description: r.description,
        note: '',
        date: r.date,
        bank: r.bank,
        smsId: r.smsId,
        transfer_to: null,
      }));
    const count = bulkInsertSmsTransactions(toImport);
    recordImportedSmsIds(results.map(r => r.smsId));
    setImportedCount(count);
    setStage('done');
    onImportComplete(count);
  };

  const selectedCount = results.filter(r => r.selected).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: STATUS_BAR_HEIGHT }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Import Bank SMS</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color={colors.textSub} />
          </TouchableOpacity>
        </View>

        {stage === 'idle' && (
          <View style={styles.idleContainer}>
            {Platform.OS !== 'android' ? (
              <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                <Feather name="alert-circle" size={44} color={colors.warning} />
                <Text style={[styles.infoTitle, { color: colors.text }]}>Android Only</Text>
                <Text style={[styles.infoText, { color: colors.textMuted }]}>SMS Import is only available on Android devices.</Text>
              </View>
            ) : isExpoGo() ? (
              <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                <Feather name="info" size={44} color={colors.primary} />
                <Text style={[styles.infoTitle, { color: colors.text }]}>APK Build Required</Text>
                <Text style={[styles.infoText, { color: colors.textMuted }]}>SMS Import requires the full APK build — not available in Expo Go.</Text>
                <View style={[styles.codeBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.codeText, { color: colors.textSub }]}>eas build --platform android --profile preview</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                  <Feather name="message-square" size={44} color={colors.primary} />
                  <Text style={[styles.infoTitle, { color: colors.text }]}>Import Bank SMS</Text>
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>
                    Scans your inbox, picks up bank transaction messages, and shows only new ones to import. Already-imported messages are automatically skipped.
                  </Text>
                </View>
                <View style={styles.rangeSection}>
                  <Text style={[styles.rangeLabel, { color: colors.textFaint }]}>Date range to scan</Text>
                  <View style={styles.rangeChips}>
                    {DATE_RANGE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.rangeChip, { backgroundColor: colors.cardAlt }, dateRange === opt.key && { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
                        onPress={() => setDateRange(opt.key)}
                      >
                        <Text style={[styles.rangeChipText, { color: dateRange === opt.key ? colors.primary : colors.textSub }, dateRange === opt.key && { fontWeight: '700' }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={startScan}>
                  <Feather name="download" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Scan SMS Messages</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {stage === 'scanning' && (
          <View style={styles.scanningContainer}>
            <Feather name="search" size={44} color={colors.primary} />
            <Text style={[styles.scanningTitle, { color: colors.text }]}>Scanning SMS Messages...</Text>
            <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
              <Animated.View style={[styles.progressBar, { backgroundColor: colors.primary, width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>{Math.round(progress)}%</Text>
            <View style={styles.statsRow}>
              {[{ val: smsRead, label: 'SMS Read' }, { val: bankSmsFound, label: 'Bank SMS' }, { val: results.length, label: 'New Found' }].map(stat => (
                <View key={stat.label} style={[styles.statBox, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>{stat.val}</Text>
                  <Text style={[styles.statLabel, { color: colors.textFaint }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {stage === 'review' && (
          <>
            <View style={[styles.reviewHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Text style={[styles.reviewSummary, { color: colors.textSub }]}>
                {results.length === 0 ? 'No new transactions found' : `${results.length} new transactions found · ${selectedCount} selected`}
              </Text>
              {results.length > 0 && (
                <View style={styles.selectActions}>
                  <TouchableOpacity onPress={selectAll} style={[styles.selectBtn, { backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.selectBtnText, { color: colors.primary }]}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={deselectAll} style={[styles.selectBtn, { backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.selectBtnText, { color: colors.primary }]}>None</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {results.length === 0 ? (
              <View style={styles.emptyReview}>
                <Feather name="check-circle" size={48} color={colors.success} />
                <Text style={[styles.emptyReviewTitle, { color: colors.text }]}>All caught up!</Text>
                <Text style={[styles.emptyReviewText, { color: colors.textMuted }]}>No new transactions found in this date range. Already-imported ones are automatically skipped.</Text>
                <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={handleClose}>
                  <Text style={styles.doneBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView style={styles.resultsList}>
                  {results.map((item, index) => (
                    <TouchableOpacity
                      key={item.smsId}
                      style={[styles.resultItem, { backgroundColor: colors.card }, item.selected && { borderColor: colors.primary, borderWidth: 1.5 }]}
                      onPress={() => toggleSelect(index)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.resultCheckbox, { borderColor: colors.border }, item.selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                        {item.selected && <Feather name="check" size={12} color="#FFFFFF" />}
                      </View>
                      <View style={[styles.resultIcon, { backgroundColor: item.type === 'credit' ? colors.successBg : colors.dangerBg }]}>
                        <Feather
                          name={item.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}
                          size={14}
                          color={item.type === 'credit' ? colors.success : colors.danger}
                        />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={[styles.resultDescription, { color: colors.text }]} numberOfLines={1}>{item.description}</Text>
                        <Text style={[styles.resultMeta, { color: colors.textFaint }]}>{item.bank} · {item.date}</Text>
                      </View>
                      <Text style={[styles.resultAmount, { color: item.type === 'credit' ? colors.success : colors.danger }]}>
                        {item.type === 'credit' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 120 }} />
                </ScrollView>

                <View style={[styles.importBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.importBtn, { backgroundColor: selectedCount === 0 ? colors.textFaint : colors.primary }]}
                    onPress={handleImport}
                    disabled={selectedCount === 0}
                  >
                    <Feather name="download" size={18} color="#FFFFFF" />
                    <Text style={styles.importBtnText}>
                      Import {selectedCount > 0 ? `${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}` : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        {stage === 'done' && (
          <View style={styles.doneContainer}>
            <View style={[styles.doneIcon, { backgroundColor: colors.successBg }]}>
              <Feather name="check" size={40} color={colors.success} />
            </View>
            <Text style={[styles.doneTitle, { color: colors.text }]}>Import Complete</Text>
            <Text style={[styles.doneSubtitle, { color: colors.textMuted }]}>
              {importedCount} transaction{importedCount !== 1 ? 's' : ''} added successfully.
            </Text>
            <Text style={[styles.doneHint, { color: colors.textFaint }]}>
              Review and categorise them in the Home or All Transactions tab.
            </Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={handleClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  idleContainer: { flex: 1, padding: 20 },
  infoBox: { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
  infoTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  infoText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  codeBox: { borderRadius: 8, padding: 12, marginTop: 12, width: '100%' },
  codeText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  rangeSection: { marginBottom: 20 },
  rangeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  rangeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  rangeChipText: { fontSize: 13, fontWeight: '500' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 16 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  scanningContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  scanningTitle: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 24 },
  progressBarContainer: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 15, fontWeight: '600', marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 4 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  reviewSummary: { fontSize: 14, fontWeight: '500', flex: 1 },
  selectActions: { flexDirection: 'row', gap: 8 },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  selectBtnText: { fontSize: 13, fontWeight: '600' },
  resultsList: { flex: 1 },
  resultItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, borderWidth: 1.5, borderColor: 'transparent' },
  resultCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  resultIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  resultInfo: { flex: 1 },
  resultDescription: { fontSize: 14, fontWeight: '600' },
  resultMeta: { fontSize: 12, marginTop: 2 },
  resultAmount: { fontSize: 14, fontWeight: '700' },
  importBar: { borderTopWidth: 1, padding: 16 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  importBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  emptyReview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyReviewTitle: { fontSize: 22, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  emptyReviewText: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  doneIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
  doneSubtitle: { fontSize: 16, textAlign: 'center', marginBottom: 8 },
  doneHint: { fontSize: 14, textAlign: 'center', marginBottom: 32 },
  doneBtn: { borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

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
import { getImportedSmsIds, bulkInsertSmsTransactions, deleteTransactionBySmsId, recordImportedSmsIds } from '../lib/database';
import { readSms, getSmsAndroidModule } from '../lib/smsAndroid';
import { useTheme } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImportComplete: (count: number) => void;
}

interface SmsResult extends ParsedSmsTransaction {
  alreadyImported: boolean;
  selected: boolean;
  deleted: boolean;
  flaggedDuplicate: boolean;
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
    const allParsed: SmsResult[] = [];
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
        for (const p of parsed) allParsed.push({ ...p, selected: !p.alreadyImported, deleted: false, flaggedDuplicate: false });
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

    setResults(allParsed);
    setStage('review');
    animateProgress(100);
  };

  const toggleSelect = (index: number) => setResults(prev =>
    prev.map((item, i) => i === index && !item.alreadyImported && !item.deleted && !item.flaggedDuplicate ? { ...item, selected: !item.selected } : item)
  );

  const toggleDuplicate = (index: number) => setResults(prev =>
    prev.map((item, i) => i === index && !item.alreadyImported ? { ...item, flaggedDuplicate: !item.flaggedDuplicate, selected: false } : item)
  );

  const handleDeleteImported = (index: number, smsId: string) => {
    Alert.alert('Remove Transaction', 'This will delete the previously imported transaction from your records. The SMS will be available to re-import.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        deleteTransactionBySmsId(smsId);
        setResults(prev => prev.map((item, i) => i === index ? { ...item, alreadyImported: false, deleted: false, selected: true, flaggedDuplicate: false } : item));
      }},
    ]);
  };

  const selectAll = () => setResults(prev => prev.map(item => (!item.alreadyImported && !item.deleted && !item.flaggedDuplicate ? { ...item, selected: true } : item)));
  const deselectAll = () => setResults(prev => prev.map(item => (!item.alreadyImported && !item.deleted ? { ...item, selected: false } : item)));

  const handleImport = () => {
    const toImport = results
      .filter(r => r.selected && !r.alreadyImported && !r.deleted && !r.flaggedDuplicate)
      .map(r => ({ amount: r.amount, type: r.type, category: r.type === 'credit' ? 'Income' : 'Other', description: r.description, note: '', date: r.date, bank: r.bank, smsId: r.smsId }));
    const count = bulkInsertSmsTransactions(toImport);
    const allShownIds = results.filter(r => !r.alreadyImported).map(r => r.smsId);
    recordImportedSmsIds(allShownIds);
    setImportedCount(count);
    setStage('done');
    onImportComplete(count);
  };

  const selectedCount = results.filter(r => r.selected && !r.alreadyImported && !r.deleted && !r.flaggedDuplicate).length;
  const newCount = results.filter(r => !r.alreadyImported && !r.deleted && !r.flaggedDuplicate).length;
  const alreadyCount = results.filter(r => r.alreadyImported && !r.deleted).length;
  const duplicateCount = results.filter(r => r.flaggedDuplicate).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: STATUS_BAR_HEIGHT }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Import SMS Transactions</Text>
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
                <Text style={[styles.infoText, { color: colors.textMuted }]}>SMS Import is only available on Android devices. It reads your bank SMS messages to automatically create expense entries.</Text>
              </View>
            ) : isExpoGo() ? (
              <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                <Feather name="info" size={44} color={colors.primary} />
                <Text style={[styles.infoTitle, { color: colors.text }]}>APK Build Required</Text>
                <Text style={[styles.infoText, { color: colors.textMuted }]}>SMS Import requires the full APK build. It is not available in Expo Go.</Text>
                <View style={[styles.codeBox, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.codeText, { color: colors.textSub }]}>eas build --platform android --profile preview</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                  <Feather name="message-square" size={44} color={colors.primary} />
                  <Text style={[styles.infoTitle, { color: colors.text }]}>Import Bank SMS</Text>
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>Reads your bank SMS, filters real transactions, and shows only new ones for you to review.</Text>
                  <View style={[styles.infoDetailBox, { backgroundColor: colors.cardAlt }]}>
                    <View style={styles.infoRow}>
                      <Feather name="filter" size={14} color={colors.primary} />
                      <Text style={[styles.infoDetail, { color: colors.textMuted }]}>Mandate / autopay setup messages are excluded automatically</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Feather name="copy" size={14} color={colors.warning} />
                      <Text style={[styles.infoDetail, { color: colors.textMuted }]}>If you see a duplicate, tap the flag icon to skip it</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Feather name="shield" size={14} color={colors.success} />
                      <Text style={[styles.infoDetail, { color: colors.textMuted }]}>All data stays on your phone — nothing is uploaded</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rangeSection}>
                  <Text style={[styles.rangeLabel, { color: colors.textFaint }]}>Select date range to scan</Text>
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
              {[{ val: smsRead, label: 'SMS Read' }, { val: bankSmsFound, label: 'Bank SMS' }, { val: results.length, label: 'Found' }].map(stat => (
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
                {results.length} found • {newCount} new • {alreadyCount} imported
                {duplicateCount > 0 ? ` • ${duplicateCount} flagged` : ''}
              </Text>
              <View style={styles.selectActions}>
                <TouchableOpacity onPress={selectAll} style={[styles.selectBtn, { backgroundColor: colors.primaryBg }]}>
                  <Text style={[styles.selectBtnText, { color: colors.primary }]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deselectAll} style={[styles.selectBtn, { backgroundColor: colors.primaryBg }]}>
                  <Text style={[styles.selectBtnText, { color: colors.primary }]}>None</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.resultsList}>
              {results.length === 0 ? (
                <View style={styles.emptyResults}>
                  <Feather name="inbox" size={44} color={colors.textFaint} />
                  <Text style={[styles.emptyResultsTitle, { color: colors.textSub }]}>No transactions found</Text>
                  <Text style={[styles.emptyResultsText, { color: colors.textFaint }]}>No bank transactions were found in the selected date range. Try a wider range.</Text>
                </View>
              ) : (
                results.map((item, index) => {
                  const isSelected = item.selected && !item.alreadyImported && !item.flaggedDuplicate;
                  return (
                    <TouchableOpacity
                      key={item.smsId}
                      style={[
                        styles.resultItem,
                        { backgroundColor: colors.card },
                        item.alreadyImported && { opacity: 0.55, backgroundColor: colors.cardAlt },
                        item.flaggedDuplicate && { opacity: 0.5, backgroundColor: colors.warningBg, borderColor: colors.warning },
                        isSelected && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
                      ]}
                      onPress={() => toggleSelect(index)}
                      disabled={item.alreadyImported}
                      activeOpacity={0.7}
                    >
                      <View style={styles.resultCheckbox}>
                        {item.alreadyImported ? (
                          <View style={[styles.importedBadge, { backgroundColor: colors.successBg }]}>
                            <Text style={[styles.importedBadgeText, { color: colors.successText }]}>Done</Text>
                          </View>
                        ) : item.flaggedDuplicate ? (
                          <View style={[styles.dupBadge, { backgroundColor: colors.warningBg }]}>
                            <Text style={[styles.dupBadgeText, { color: colors.warningText }]}>Skip</Text>
                          </View>
                        ) : (
                          <View style={[styles.checkbox, { borderColor: colors.border }, item.selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                            {item.selected && <Feather name="check" size={11} color="#FFFFFF" />}
                          </View>
                        )}
                      </View>

                      <View style={styles.resultContent}>
                        <View style={styles.resultTopRow}>
                          <Text style={[styles.resultAmount, { color: colors.text }]}>₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                          <View style={[styles.typeBadge, item.type === 'credit' ? { backgroundColor: colors.successBg } : { backgroundColor: colors.dangerBg }]}>
                            <Text style={[styles.typeBadgeText, { color: item.type === 'credit' ? colors.successText : colors.dangerText }]}>
                              {item.type === 'credit' ? '▲ CREDIT' : '▼ DEBIT'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.resultDesc, { color: colors.textSub }]} numberOfLines={1}>{item.description}</Text>
                        <Text style={[styles.resultMeta, { color: colors.textFaint }]}>{item.bank} • {item.date}</Text>
                      </View>

                      {item.alreadyImported ? (
                        <TouchableOpacity style={[styles.deleteImportedBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleDeleteImported(index, item.smsId)}>
                          <Feather name="trash-2" size={15} color={colors.danger} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={[styles.flagBtn, { backgroundColor: colors.cardAlt }, item.flaggedDuplicate && { backgroundColor: colors.warningBg }]} onPress={() => toggleDuplicate(index)}>
                          <Feather name="copy" size={14} color={item.flaggedDuplicate ? colors.warning : colors.textFaint} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
              <View style={{ height: 16 }} />
            </ScrollView>

            <View style={[styles.reviewFooter, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
              {duplicateCount > 0 && (
                <Text style={[styles.dupNote, { backgroundColor: colors.warningBg, color: colors.warningText }]}>
                  {duplicateCount} transaction{duplicateCount !== 1 ? 's' : ''} flagged as duplicate will be skipped
                </Text>
              )}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, selectedCount === 0 && { backgroundColor: colors.textFaint }]}
                onPress={handleImport}
                disabled={selectedCount === 0}
              >
                <Feather name="check-circle" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Import {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === 'done' && (
          <View style={styles.doneContainer}>
            <View style={[styles.doneIconWrap, { backgroundColor: colors.successBg }]}>
              <Feather name="check-circle" size={64} color={colors.success} />
            </View>
            <Text style={[styles.doneTitle, { color: colors.text }]}>Import Complete!</Text>
            <Text style={[styles.doneText, { color: colors.textMuted }]}>Successfully imported {importedCount} transaction{importedCount !== 1 ? 's' : ''}.</Text>
            <Text style={[styles.doneNote, { color: colors.textFaint }]}>Next time you scan, only new messages will appear — already-seen SMS are tracked automatically.</Text>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleClose}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  idleContainer: { flex: 1, padding: 20 },
  infoBox: { alignItems: 'center', borderRadius: 20, padding: 20, width: '100%', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoTitle: { fontSize: 20, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  infoText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  infoDetailBox: { width: '100%', borderRadius: 12, padding: 12, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoDetail: { flex: 1, fontSize: 13, lineHeight: 18 },
  codeBox: { borderRadius: 8, padding: 12, width: '100%' },
  codeText: { fontFamily: 'monospace', fontSize: 13 },
  rangeSection: { marginBottom: 16 },
  rangeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  rangeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  rangeChipText: { fontSize: 13, fontWeight: '500' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, width: '100%' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  scanningContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  scanningTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 24 },
  progressBarContainer: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 14, marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 16, width: '100%' },
  statBox: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 4 },
  reviewHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewSummary: { fontSize: 13, fontWeight: '500', flex: 1 },
  selectActions: { flexDirection: 'row', gap: 8 },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  selectBtnText: { fontSize: 13, fontWeight: '600' },
  resultsList: { flex: 1 },
  resultItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: 'transparent', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  resultCheckbox: { marginRight: 10, width: 40, alignItems: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  importedBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  importedBadgeText: { fontSize: 10, fontWeight: '700' },
  dupBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  dupBadgeText: { fontSize: 10, fontWeight: '700' },
  resultContent: { flex: 1 },
  resultTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  resultAmount: { fontSize: 16, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  resultDesc: { fontSize: 13, marginBottom: 2 },
  resultMeta: { fontSize: 12 },
  deleteImportedBtn: { padding: 8, marginLeft: 4, borderRadius: 8 },
  flagBtn: { padding: 8, marginLeft: 4, borderRadius: 8 },
  reviewFooter: { padding: 16, borderTopWidth: 1, gap: 8 },
  dupNote: { fontSize: 12, textAlign: 'center', padding: 8, borderRadius: 8 },
  emptyResults: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyResultsTitle: { fontSize: 17, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  emptyResultsText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  doneIconWrap: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  doneTitle: { fontSize: 26, fontWeight: '800' },
  doneText: { fontSize: 16, textAlign: 'center' },
  doneNote: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
});

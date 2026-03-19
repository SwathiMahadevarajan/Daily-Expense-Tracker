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

function isExpoGo(): boolean {
  const env = Constants.executionEnvironment;
  return env === 'storeClient';
}

function getDateRangeFilter(range: DateRange): { minTs: number; maxTs: number } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000 - 1;

  switch (range) {
    case 'today':
      return { minTs: todayStart, maxTs: todayEnd };
    case 'yesterday':
      return { minTs: todayStart - 86400000, maxTs: todayStart - 1 };
    case 'week':
      return { minTs: todayStart - 6 * 86400000, maxTs: todayEnd };
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { minTs: start, maxTs: todayEnd };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      return { minTs: start, maxTs: end };
    }
    case 'all':
    default:
      return { minTs: 0, maxTs: Date.now() + 86400000 };
  }
}

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

export default function SmsImportModal({ visible, onClose, onImportComplete }: Props) {
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
    setStage('idle');
    setProgress(0);
    setSmsRead(0);
    setBankSmsFound(0);
    setResults([]);
    setImportedCount(0);
    progressAnim.setValue(0);
    onClose();
  };

  const startScan = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'SMS Import is only available on Android devices.');
      return;
    }

    if (isExpoGo()) {
      Alert.alert(
        'Full Build Required',
        'SMS Import requires the full APK build and is not available in Expo Go.\n\nBuild the APK using:\neas build --platform android --profile preview',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'SMS Permission Required',
          message:
            'Expense Tracker needs to read your SMS messages to import bank transactions. ' +
            'Only financial SMS from banks will be processed. No data leaves your phone.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'Allow',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission Denied', 'SMS permission is required to import bank transactions.');
        return;
      }
    } catch {
      Alert.alert('Error', 'Failed to request SMS permission.');
      return;
    }

    setStage('scanning');
    setSmsRead(0);
    setBankSmsFound(0);
    setResults([]);
    animateProgress(0);

    if (!getSmsAndroidModule()) {
      Alert.alert(
        'Module Not Available',
        'SMS reading requires the full APK build via EAS Build.\n\nRun: eas build --platform android --profile preview',
        [{ text: 'OK' }]
      );
      setStage('idle');
      return;
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
      for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
        chunks.push(filtered.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        const { parsed, bankSmsCount } = processSmsChunk(chunk, importedIds);
        totalRead += chunk.length;
        totalBankSms += bankSmsCount;
        for (const p of parsed) {
          allParsed.push({ ...p, selected: !p.alreadyImported, deleted: false, flaggedDuplicate: false });
        }
        setSmsRead(totalRead);
        setBankSmsFound(totalBankSms);
        animateProgress(Math.min((totalRead / Math.max(filtered.length, 1)) * 100, 100));
        await new Promise(r => setTimeout(r, 10));
      }

      if (filtered.length === 0) {
        setSmsRead(rawMessages.length);
      }
    } catch (err: any) {
      Alert.alert('SMS Read Error', err.message ?? 'Unknown error reading SMS.');
      setStage('idle');
      return;
    }

    setResults(allParsed);
    setStage('review');
    animateProgress(100);
  };

  const toggleSelect = (index: number) => {
    setResults(prev =>
      prev.map((item, i) =>
        i === index && !item.alreadyImported && !item.deleted && !item.flaggedDuplicate
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  };

  const toggleDuplicate = (index: number) => {
    setResults(prev =>
      prev.map((item, i) =>
        i === index && !item.alreadyImported
          ? { ...item, flaggedDuplicate: !item.flaggedDuplicate, selected: false }
          : item
      )
    );
  };

  const handleDeleteImported = (index: number, smsId: string) => {
    Alert.alert(
      'Remove Transaction',
      'This will delete the previously imported transaction from your records. The SMS will be available to re-import.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteTransactionBySmsId(smsId);
            setResults(prev =>
              prev.map((item, i) =>
                i === index
                  ? { ...item, alreadyImported: false, deleted: false, selected: true, flaggedDuplicate: false }
                  : item
              )
            );
          },
        },
      ]
    );
  };

  const selectAll = () =>
    setResults(prev => prev.map(item =>
      (!item.alreadyImported && !item.deleted && !item.flaggedDuplicate ? { ...item, selected: true } : item)
    ));

  const deselectAll = () =>
    setResults(prev => prev.map(item =>
      (!item.alreadyImported && !item.deleted ? { ...item, selected: false } : item)
    ));

  const handleImport = () => {
    const toImport = results
      .filter(r => r.selected && !r.alreadyImported && !r.deleted && !r.flaggedDuplicate)
      .map(r => ({
        amount: r.amount,
        type: r.type,
        category: r.type === 'credit' ? 'Income' : 'Other',
        description: r.description,
        note: '',
        date: r.date,
        bank: r.bank,
        smsId: r.smsId,
      }));

    const count = bulkInsertSmsTransactions(toImport);

    const allShownIds = results
      .filter(r => !r.alreadyImported)
      .map(r => r.smsId);
    recordImportedSmsIds(allShownIds);

    setImportedCount(count);
    setStage('done');
    onImportComplete(count);
  };

  const selectedCount = results.filter(r => r.selected && !r.alreadyImported && !r.deleted && !r.flaggedDuplicate).length;
  const newCount = results.filter(r => !r.alreadyImported && !r.deleted && !r.flaggedDuplicate).length;
  const alreadyCount = results.filter(r => r.alreadyImported && !r.deleted).length;
  const duplicateCount = results.filter(r => r.flaggedDuplicate).length;

  const renderProgressBar = () => (
    <View style={styles.progressBarContainer}>
      <Animated.View
        style={[
          styles.progressBar,
          { width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: STATUS_BAR_HEIGHT }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Import SMS Transactions</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {stage === 'idle' && (
          <View style={styles.idleContainer}>
            {Platform.OS !== 'android' ? (
              <View style={styles.infoBox}>
                <Feather name="alert-circle" size={44} color="#F59E0B" />
                <Text style={styles.infoTitle}>Android Only</Text>
                <Text style={styles.infoText}>
                  SMS Import is only available on Android devices. It reads your bank SMS messages to automatically create expense entries.
                </Text>
              </View>
            ) : isExpoGo() ? (
              <View style={styles.infoBox}>
                <Feather name="info" size={44} color="#6366F1" />
                <Text style={styles.infoTitle}>APK Build Required</Text>
                <Text style={styles.infoText}>
                  SMS Import requires the full APK build. It is not available in Expo Go.
                </Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>eas build --platform android --profile preview</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.infoBox}>
                  <Feather name="message-square" size={44} color="#6366F1" />
                  <Text style={styles.infoTitle}>Import Bank SMS</Text>
                  <Text style={styles.infoText}>
                    Reads your bank SMS, filters real transactions, and shows only new ones for you to review.
                  </Text>
                  <View style={styles.infoDetailBox}>
                    <View style={styles.infoRow}>
                      <Feather name="filter" size={14} color="#6366F1" />
                      <Text style={styles.infoDetail}>Mandate / autopay setup messages are excluded automatically</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Feather name="copy" size={14} color="#F59E0B" />
                      <Text style={styles.infoDetail}>If you see a duplicate, tap the flag icon to skip it</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Feather name="shield" size={14} color="#10B981" />
                      <Text style={styles.infoDetail}>All data stays on your phone — nothing is uploaded</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rangeSection}>
                  <Text style={styles.rangeLabel}>Select date range to scan</Text>
                  <View style={styles.rangeChips}>
                    {DATE_RANGE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.rangeChip, dateRange === opt.key && styles.rangeChipActive]}
                        onPress={() => setDateRange(opt.key)}
                      >
                        <Text style={[styles.rangeChipText, dateRange === opt.key && styles.rangeChipTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={startScan}>
                  <Feather name="download" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Scan SMS Messages</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {stage === 'scanning' && (
          <View style={styles.scanningContainer}>
            <Feather name="search" size={44} color="#6366F1" />
            <Text style={styles.scanningTitle}>Scanning SMS Messages...</Text>
            {renderProgressBar()}
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{smsRead}</Text>
                <Text style={styles.statLabel}>SMS Read</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{bankSmsFound}</Text>
                <Text style={styles.statLabel}>Bank SMS</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{results.length}</Text>
                <Text style={styles.statLabel}>Found</Text>
              </View>
            </View>
          </View>
        )}

        {stage === 'review' && (
          <>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewSummary}>
                {results.length} found • {newCount} new • {alreadyCount} imported
                {duplicateCount > 0 ? ` • ${duplicateCount} flagged` : ''}
              </Text>
              <View style={styles.selectActions}>
                <TouchableOpacity onPress={selectAll} style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deselectAll} style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>None</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.resultsList}>
              {results.length === 0 ? (
                <View style={styles.emptyResults}>
                  <Feather name="inbox" size={44} color="#D1D5DB" />
                  <Text style={styles.emptyResultsTitle}>No transactions found</Text>
                  <Text style={styles.emptyResultsText}>
                    No bank transactions were found in the selected date range. Try a wider range.
                  </Text>
                </View>
              ) : (
                results.map((item, index) => (
                  <TouchableOpacity
                    key={item.smsId}
                    style={[
                      styles.resultItem,
                      item.alreadyImported && styles.resultItemDimmed,
                      item.flaggedDuplicate && styles.resultItemDuplicate,
                      item.selected && !item.alreadyImported && !item.flaggedDuplicate && styles.resultItemSelected,
                    ]}
                    onPress={() => toggleSelect(index)}
                    disabled={item.alreadyImported}
                    activeOpacity={0.7}
                  >
                    <View style={styles.resultCheckbox}>
                      {item.alreadyImported ? (
                        <View style={styles.importedBadge}>
                          <Text style={styles.importedBadgeText}>Done</Text>
                        </View>
                      ) : item.flaggedDuplicate ? (
                        <View style={styles.dupBadge}>
                          <Text style={styles.dupBadgeText}>Skip</Text>
                        </View>
                      ) : (
                        <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                          {item.selected && <Feather name="check" size={11} color="#FFFFFF" />}
                        </View>
                      )}
                    </View>

                    <View style={styles.resultContent}>
                      <View style={styles.resultTopRow}>
                        <Text style={styles.resultAmount}>
                          ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Text>
                        <View style={[styles.typeBadge, item.type === 'credit' ? styles.creditBadge : styles.debitBadge]}>
                          <Text style={[styles.typeBadgeText, { color: item.type === 'credit' ? '#065F46' : '#991B1B' }]}>
                            {item.type === 'credit' ? '▲ CREDIT' : '▼ DEBIT'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.resultDesc} numberOfLines={1}>{item.description}</Text>
                      <Text style={styles.resultMeta}>{item.bank} • {item.date}</Text>
                    </View>

                    {item.alreadyImported ? (
                      <TouchableOpacity
                        style={styles.deleteImportedBtn}
                        onPress={() => handleDeleteImported(index, item.smsId)}
                      >
                        <Feather name="trash-2" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.flagBtn, item.flaggedDuplicate && styles.flagBtnActive]}
                        onPress={() => toggleDuplicate(index)}
                      >
                        <Feather name="copy" size={14} color={item.flaggedDuplicate ? '#F59E0B' : '#D1D5DB'} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 16 }} />
            </ScrollView>

            <View style={styles.reviewFooter}>
              {duplicateCount > 0 && (
                <Text style={styles.dupNote}>
                  {duplicateCount} transaction{duplicateCount !== 1 ? 's' : ''} flagged as duplicate will be skipped
                </Text>
              )}
              <TouchableOpacity
                style={[styles.primaryBtn, selectedCount === 0 && styles.disabledBtn]}
                onPress={handleImport}
                disabled={selectedCount === 0}
              >
                <Feather name="check-circle" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>
                  Import {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === 'done' && (
          <View style={styles.doneContainer}>
            <View style={styles.doneIconWrap}>
              <Feather name="check-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.doneTitle}>Import Complete!</Text>
            <Text style={styles.doneText}>
              Successfully imported {importedCount} transaction{importedCount !== 1 ? 's' : ''}.
            </Text>
            <Text style={styles.doneNote}>
              Next time you scan, only new messages will appear — already-seen SMS are tracked automatically.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  closeBtn: { padding: 4 },
  idleContainer: { flex: 1, padding: 20 },
  infoBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 8 },
  infoText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  infoDetailBox: { width: '100%', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoDetail: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 18 },
  codeBox: { backgroundColor: '#F3F4F6', borderRadius: 8, padding: 12, width: '100%' },
  codeText: { fontFamily: 'monospace', fontSize: 13, color: '#374151' },
  rangeSection: { marginBottom: 16 },
  rangeLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  rangeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: 'transparent',
  },
  rangeChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  rangeChipText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  rangeChipTextActive: { color: '#6366F1', fontWeight: '700' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabledBtn: { backgroundColor: '#D1D5DB' },
  scanningContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  scanningTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 24 },
  progressBarContainer: {
    width: '100%', height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginBottom: 8,
  },
  progressBar: { height: '100%', backgroundColor: '#6366F1', borderRadius: 4 },
  progressText: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 16, width: '100%' },
  statBox: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  statValue: { fontSize: 26, fontWeight: '700', color: '#6366F1' },
  statLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  reviewHeader: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  reviewSummary: { fontSize: 13, color: '#374151', fontWeight: '500', flex: 1 },
  selectActions: { flexDirection: 'row', gap: 8 },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: '#EEF2FF' },
  selectBtnText: { fontSize: 13, color: '#6366F1', fontWeight: '600' },
  resultsList: { flex: 1 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  resultItemDimmed: { opacity: 0.55, backgroundColor: '#F9FAFB' },
  resultItemDuplicate: { opacity: 0.5, backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  resultItemSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  resultCheckbox: { marginRight: 10, width: 40, alignItems: 'center' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  importedBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  importedBadgeText: { fontSize: 10, color: '#065F46', fontWeight: '700' },
  dupBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  dupBadgeText: { fontSize: 10, color: '#92400E', fontWeight: '700' },
  resultContent: { flex: 1 },
  resultTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  resultAmount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  debitBadge: { backgroundColor: '#FEE2E2' },
  creditBadge: { backgroundColor: '#D1FAE5' },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  resultDesc: { fontSize: 13, color: '#374151', marginBottom: 2 },
  resultMeta: { fontSize: 12, color: '#9CA3AF' },
  deleteImportedBtn: {
    padding: 8, marginLeft: 4, backgroundColor: '#FEF2F2', borderRadius: 8,
  },
  flagBtn: {
    padding: 8, marginLeft: 4, backgroundColor: '#F9FAFB', borderRadius: 8,
  },
  flagBtnActive: { backgroundColor: '#FFFBEB' },
  reviewFooter: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  dupNote: { fontSize: 12, color: '#92400E', textAlign: 'center', backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8 },
  emptyResults: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyResultsTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 8 },
  emptyResultsText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  doneIconWrap: { marginBottom: 20 },
  doneTitle: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 8 },
  doneText: { fontSize: 16, color: '#374151', textAlign: 'center', marginBottom: 8 },
  doneNote: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 32, paddingHorizontal: 16 },
});

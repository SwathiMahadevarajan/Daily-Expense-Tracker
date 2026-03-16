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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { parseSmsMessage, processSmsChunk, ParsedSmsTransaction } from '../lib/smsParser';
import { getImportedSmsIds, bulkInsertSmsTransactions } from '../lib/database';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImportComplete: (count: number) => void;
}

interface SmsResult extends ParsedSmsTransaction {
  alreadyImported: boolean;
  selected: boolean;
}

type Stage = 'idle' | 'scanning' | 'review' | 'done';

const CHUNK_SIZE = 50;
const MAX_SMS = 1000;

function isExpoGo(): boolean {
  const env = Constants.executionEnvironment;
  return env === 'storeClient';
}

export default function SmsImportModal({ visible, onClose, onImportComplete }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [smsRead, setSmsRead] = useState(0);
  const [bankSmsFound, setBankSmsFound] = useState(0);
  const [results, setResults] = useState<SmsResult[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateProgress = (value: number) => {
    Animated.timing(progressAnim, {
      toValue: value,
      duration: 300,
      useNativeDriver: false,
    }).start();
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
            'Only financial SMS from banks will be processed. ' +
            'No data is sent to any server.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'Allow',
        }
      );

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Permission Denied',
          'SMS permission is required to import bank transactions. ' +
          'You can grant it in Settings > Apps > Expense Tracker > Permissions.'
        );
        return;
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to request SMS permission.');
      return;
    }

    setStage('scanning');
    setSmsRead(0);
    setBankSmsFound(0);
    setResults([]);
    animateProgress(0);

    let SmsAndroid: any;
    try {
      SmsAndroid = require('react-native-get-sms-android');
    } catch {
      Alert.alert(
        'Module Not Available',
        'SMS reading module is not available. Please build the full APK using EAS Build.'
      );
      setStage('idle');
      return;
    }

    const importedIds = getImportedSmsIds();
    const allParsed: SmsResult[] = [];
    let totalRead = 0;
    let totalBankSms = 0;

    const filter = {
      box: 'inbox',
      maxCount: MAX_SMS,
    };

    try {
      await new Promise<void>((resolve, reject) => {
        SmsAndroid.list(
          JSON.stringify(filter),
          (fail: string) => {
            reject(new Error(fail));
          },
          (count: number, smsList: string) => {
            const rawMessages = JSON.parse(smsList);
            const chunks: any[][] = [];
            for (let i = 0; i < rawMessages.length; i += CHUNK_SIZE) {
              chunks.push(rawMessages.slice(i, i + CHUNK_SIZE));
            }

            const processChunks = async () => {
              for (let ci = 0; ci < chunks.length; ci++) {
                const chunk = chunks[ci];
                const { parsed, bankSmsCount } = processSmsChunk(chunk, importedIds);

                totalRead += chunk.length;
                totalBankSms += bankSmsCount;

                for (const p of parsed) {
                  allParsed.push({
                    ...p,
                    selected: !p.alreadyImported,
                  });
                }

                setSmsRead(totalRead);
                setBankSmsFound(totalBankSms);
                animateProgress(Math.min((totalRead / Math.max(count, 1)) * 100, 100));

                await new Promise(r => setTimeout(r, 10));
              }
              resolve();
            };

            processChunks().catch(reject);
          }
        );
      });
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
        i === index && !item.alreadyImported
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  };

  const selectAll = () => {
    setResults(prev =>
      prev.map(item => (item.alreadyImported ? item : { ...item, selected: true }))
    );
  };

  const deselectAll = () => {
    setResults(prev =>
      prev.map(item => (item.alreadyImported ? item : { ...item, selected: false }))
    );
  };

  const handleImport = () => {
    const toImport = results
      .filter(r => r.selected && !r.alreadyImported)
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
    setImportedCount(count);
    setStage('done');
    onImportComplete(count);
  };

  const renderProgressBar = () => (
    <View style={styles.progressBarContainer}>
      <Animated.View
        style={[
          styles.progressBar,
          {
            width: progressAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );

  const selectedCount = results.filter(r => r.selected && !r.alreadyImported).length;
  const newCount = results.filter(r => !r.alreadyImported).length;
  const alreadyCount = results.filter(r => r.alreadyImported).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
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
                <Feather name="alert-circle" size={40} color="#F59E0B" />
                <Text style={styles.infoTitle}>Android Only</Text>
                <Text style={styles.infoText}>
                  SMS Import is only available on Android devices. It reads your bank SMS messages
                  to automatically create expense entries.
                </Text>
              </View>
            ) : isExpoGo() ? (
              <View style={styles.infoBox}>
                <Feather name="info" size={40} color="#6366F1" />
                <Text style={styles.infoTitle}>APK Build Required</Text>
                <Text style={styles.infoText}>
                  SMS Import is not available in Expo Go. Build the full APK to use this feature:
                </Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>
                    eas build --platform android --profile preview
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.infoBox}>
                <Feather name="message-square" size={40} color="#6366F1" />
                <Text style={styles.infoTitle}>Import Bank SMS</Text>
                <Text style={styles.infoText}>
                  This will read up to 1,000 recent SMS messages, identify bank transactions,
                  and let you select which ones to import. No data is sent to any server.
                </Text>
                <Text style={styles.infoNote}>
                  Already-imported messages will be marked and pre-deselected.
                </Text>
              </View>
            )}

            {Platform.OS === 'android' && !isExpoGo() && (
              <TouchableOpacity style={styles.primaryBtn} onPress={startScan}>
                <Feather name="download" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Read SMS Messages</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {stage === 'scanning' && (
          <View style={styles.scanningContainer}>
            <Feather name="search" size={40} color="#6366F1" />
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
                <Text style={styles.statLabel}>Transactions</Text>
              </View>
            </View>
          </View>
        )}

        {stage === 'review' && (
          <>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewSummary}>
                Found {results.length} transactions ({newCount} new, {alreadyCount} already imported)
              </Text>
              <View style={styles.selectActions}>
                <TouchableOpacity onPress={selectAll} style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deselectAll} style={styles.selectBtn}>
                  <Text style={styles.selectBtnText}>Deselect All</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.resultsList}>
              {results.map((item, index) => (
                <TouchableOpacity
                  key={item.smsId}
                  style={[
                    styles.resultItem,
                    item.alreadyImported && styles.resultItemDimmed,
                    item.selected && styles.resultItemSelected,
                  ]}
                  onPress={() => toggleSelect(index)}
                  disabled={item.alreadyImported}
                >
                  <View style={styles.resultCheckbox}>
                    {item.alreadyImported ? (
                      <View style={styles.importedBadge}>
                        <Text style={styles.importedBadgeText}>Imported</Text>
                      </View>
                    ) : (
                      <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                        {item.selected && <Feather name="check" size={12} color="#FFFFFF" />}
                      </View>
                    )}
                  </View>
                  <View style={styles.resultContent}>
                    <View style={styles.resultTopRow}>
                      <Text style={styles.resultAmount}>
                        ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Text>
                      <View style={[styles.typeBadge, item.type === 'credit' ? styles.creditBadge : styles.debitBadge]}>
                        <Text style={styles.typeBadgeText}>{item.type.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.resultDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.resultMeta}>{item.bank} • {item.date}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.reviewFooter}>
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
            <View style={styles.doneIcon}>
              <Feather name="check-circle" size={60} color="#10B981" />
            </View>
            <Text style={styles.doneTitle}>Import Complete!</Text>
            <Text style={styles.doneText}>
              Successfully imported {importedCount} transaction{importedCount !== 1 ? 's' : ''} from SMS.
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
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 4,
  },
  idleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  infoBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  infoNote: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  codeBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    width: '100%',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#374151',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledBtn: {
    backgroundColor: '#D1D5DB',
  },
  scanningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  scanningTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 24,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366F1',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  reviewHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  reviewSummary: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 8,
  },
  selectActions: {
    flexDirection: 'row',
    gap: 12,
  },
  selectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  selectBtnText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  resultItemDimmed: {
    opacity: 0.5,
  },
  resultItemSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  resultCheckbox: {
    marginRight: 12,
    width: 40,
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  importedBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  importedBadgeText: {
    fontSize: 10,
    color: '#065F46',
    fontWeight: '600',
  },
  resultContent: {
    flex: 1,
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  resultAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  debitBadge: {
    backgroundColor: '#FEE2E2',
  },
  creditBadge: {
    backgroundColor: '#D1FAE5',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  resultDesc: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 2,
  },
  resultMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reviewFooter: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  doneIcon: {
    marginBottom: 16,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  doneText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
});

import { Platform } from 'react-native';

export interface Transaction {
  id: number;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  description: string;
  note: string;
  date: string;
  bank: string;
  smsId?: string;
  transfer_to?: string | null;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Food & Dining', icon: 'coffee', color: '#F59E0B', isDefault: true },
  { name: 'Transport', icon: 'truck', color: '#3B82F6', isDefault: true },
  { name: 'Shopping', icon: 'shopping-bag', color: '#EC4899', isDefault: true },
  { name: 'Bills', icon: 'zap', color: '#8B5CF6', isDefault: true },
  { name: 'Entertainment', icon: 'film', color: '#F97316', isDefault: true },
  { name: 'Health', icon: 'heart', color: '#EF4444', isDefault: true },
  { name: 'Groceries', icon: 'package', color: '#10B981', isDefault: true },
  { name: 'Education', icon: 'book', color: '#06B6D4', isDefault: true },
  { name: 'Travel', icon: 'map-pin', color: '#84CC16', isDefault: true },
  { name: 'Income', icon: 'trending-up', color: '#22C55E', isDefault: true },
  { name: 'Transfer', icon: 'repeat', color: '#6B7280', isDefault: true },
  { name: 'Other', icon: 'more-horizontal', color: '#6B7280', isDefault: true },
];

let db: any = null;

const webStore = {
  transactions: [] as Transaction[],
  categories: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 })) as Category[],
  nextTxId: 1,
  nextCatId: DEFAULT_CATEGORIES.length + 1,
  importedSmsIds: new Set<string>(),
};

function getDb() {
  if (db) return db;
  if (Platform.OS === 'web') {
    db = 'web';
    return db;
  }
  const SQLite = require('expo-sqlite');
  db = SQLite.openDatabaseSync('expense_tracker.db');
  return db;
}

export function initializeDatabase() {
  const db = getDb();
  if (db === 'web') return;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('debit', 'credit')),
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      note TEXT DEFAULT '',
      date TEXT NOT NULL,
      bank TEXT DEFAULT '',
      smsId TEXT UNIQUE,
      transfer_to TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT 'more-horizontal',
      color TEXT NOT NULL DEFAULT '#6B7280',
      isDefault INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sms_import_log (
      smsId TEXT PRIMARY KEY,
      importedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_tx_date_type ON transactions(date, type);
  `);

  migrateDatabase(db);
  seedDefaultCategories(db);
}

function migrateDatabase(db: any) {
  try { db.execSync(`ALTER TABLE transactions ADD COLUMN smsId TEXT UNIQUE;`); } catch {}
  try { db.execSync(`ALTER TABLE categories ADD COLUMN isDefault INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { db.execSync(`ALTER TABLE transactions ADD COLUMN transfer_to TEXT DEFAULT NULL;`); } catch {}
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sms_import_log (
        smsId TEXT PRIMARY KEY,
        importedAt TEXT NOT NULL
      );
    `);
  } catch {}

  db.execSync(`
    UPDATE categories SET icon = 'coffee' WHERE icon = 'utensils';
    UPDATE categories SET icon = 'truck' WHERE icon = 'car';
    UPDATE categories SET icon = 'more-horizontal' WHERE icon NOT IN (
      'coffee','truck','shopping-bag','zap','film','heart','package','book',
      'map-pin','trending-up','more-horizontal','home','music','gift','wifi',
      'phone','camera','monitor','dollar-sign','credit-card',
      'briefcase','user','users','star','flag','tag','inbox','mail','bell','repeat'
    );
  `);
}

function seedDefaultCategories(db: any) {
  for (const cat of DEFAULT_CATEGORIES) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO categories (name, icon, color, isDefault) VALUES (?, ?, ?, 1)`,
        [cat.name, cat.icon, cat.color]
      );
    } catch {}
  }
}

export function getTransactions(month?: string): Transaction[] {
  if (Platform.OS === 'web') {
    if (!month) return [...webStore.transactions].sort((a, b) => b.date.localeCompare(a.date));
    return webStore.transactions
      .filter(t => t.date.startsWith(month))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  const db = getDb();
  if (month) {
    return db.getAllSync(
      `SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC`,
      [`${month}%`]
    ) as Transaction[];
  }
  return db.getAllSync(`SELECT * FROM transactions ORDER BY date DESC`) as Transaction[];
}

export function addTransaction(tx: Omit<Transaction, 'id'>): number {
  if (Platform.OS === 'web') {
    const newTx = { ...tx, id: webStore.nextTxId++ };
    webStore.transactions.push(newTx);
    return newTx.id;
  }
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO transactions (amount, type, category, description, note, date, bank, smsId, transfer_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, tx.smsId ?? null, tx.transfer_to ?? null]
  );
  return result.lastInsertRowId;
}

export function updateTransaction(id: number, tx: Omit<Transaction, 'id'>) {
  if (Platform.OS === 'web') {
    const idx = webStore.transactions.findIndex(t => t.id === id);
    if (idx >= 0) webStore.transactions[idx] = { ...tx, id };
    return;
  }
  const db = getDb();
  db.runSync(
    `UPDATE transactions SET amount=?, type=?, category=?, description=?, note=?, date=?, bank=?, transfer_to=? WHERE id=?`,
    [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, tx.transfer_to ?? null, id]
  );
}

export function deleteTransaction(id: number) {
  if (Platform.OS === 'web') {
    webStore.transactions = webStore.transactions.filter(t => t.id !== id);
    return;
  }
  const db = getDb();
  db.runSync(`DELETE FROM transactions WHERE id=?`, [id]);
}

export function deleteTransactionBySmsId(smsId: string) {
  if (Platform.OS === 'web') {
    webStore.transactions = webStore.transactions.filter(t => t.smsId !== smsId);
    return;
  }
  const db = getDb();
  db.runSync(`DELETE FROM transactions WHERE smsId=?`, [smsId]);
}

export function bulkDeleteTransactions(ids: number[]) {
  if (ids.length === 0) return;
  if (Platform.OS === 'web') {
    const idSet = new Set(ids);
    webStore.transactions = webStore.transactions.filter(t => !idSet.has(t.id));
    return;
  }
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`DELETE FROM transactions WHERE id IN (${placeholders})`, ids);
}

export function deleteTransactionsByMonth(month: string) {
  if (Platform.OS === 'web') {
    webStore.transactions = webStore.transactions.filter(t => !t.date.startsWith(month));
    return;
  }
  const db = getDb();
  db.runSync(`DELETE FROM transactions WHERE date LIKE ?`, [`${month}%`]);
}

export function deleteAllTransactions() {
  if (Platform.OS === 'web') {
    webStore.transactions = [];
    webStore.nextTxId = 1;
    return;
  }
  const db = getDb();
  db.runSync(`DELETE FROM transactions`);
}

export function getAvailableMonths(): string[] {
  if (Platform.OS === 'web') {
    const months = new Set(webStore.transactions.map(t => t.date.slice(0, 7)));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }
  const db = getDb();
  const rows = db.getAllSync(`SELECT DISTINCT substr(date, 1, 7) as month FROM transactions ORDER BY month DESC`) as { month: string }[];
  return rows.map(r => r.month);
}

export function bulkUpdateTransactionCategory(ids: number[], category: string) {
  if (ids.length === 0) return;
  if (Platform.OS === 'web') {
    webStore.transactions = webStore.transactions.map(t =>
      ids.includes(t.id) ? { ...t, category } : t
    );
    return;
  }
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE transactions SET category=? WHERE id IN (${placeholders})`, [category, ...ids]);
}

export function bulkUpdateTransactionBank(ids: number[], bank: string) {
  if (ids.length === 0) return;
  if (Platform.OS === 'web') {
    webStore.transactions = webStore.transactions.map(t =>
      ids.includes(t.id) ? { ...t, bank } : t
    );
    return;
  }
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.runSync(`UPDATE transactions SET bank=? WHERE id IN (${placeholders})`, [bank, ...ids]);
}

export function getImportedSmsIds(): Set<string> {
  if (Platform.OS === 'web') return new Set(webStore.importedSmsIds);
  const db = getDb();
  const rows = db.getAllSync(
    `SELECT smsId FROM sms_import_log
     UNION
     SELECT smsId FROM transactions WHERE smsId IS NOT NULL`
  ) as { smsId: string }[];
  return new Set(rows.map(r => r.smsId));
}

export function recordImportedSmsIds(smsIds: string[]) {
  if (smsIds.length === 0) return;
  if (Platform.OS === 'web') {
    smsIds.forEach(id => webStore.importedSmsIds.add(id));
    return;
  }
  const db = getDb();
  const now = new Date().toISOString();
  for (const smsId of smsIds) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO sms_import_log (smsId, importedAt) VALUES (?, ?)`,
        [smsId, now]
      );
    } catch {}
  }
}

export function bulkInsertSmsTransactions(txList: Omit<Transaction, 'id'>[]): number {
  if (Platform.OS === 'web') return 0;
  const db = getDb();
  let inserted = 0;
  for (const tx of txList) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO transactions (amount, type, category, description, note, date, bank, smsId, transfer_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, tx.smsId ?? null, tx.transfer_to ?? null]
      );
      inserted++;
    } catch {}
  }
  return inserted;
}

export function getCategories(): Category[] {
  if (Platform.OS === 'web') {
    return [...webStore.categories].sort((a, b) =>
      (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name)
    );
  }
  const db = getDb();
  return db.getAllSync(`SELECT * FROM categories ORDER BY isDefault DESC, name ASC`) as Category[];
}

export function addCategory(cat: Omit<Category, 'id'>): number {
  if (Platform.OS === 'web') {
    const exists = webStore.categories.find(c => c.name === cat.name);
    if (exists) return exists.id;
    const newCat = { ...cat, id: webStore.nextCatId++, isDefault: false };
    webStore.categories.push(newCat);
    return newCat.id;
  }
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO categories (name, icon, color, isDefault) VALUES (?, ?, ?, 0)`,
    [cat.name, cat.icon, cat.color]
  );
  return result.lastInsertRowId;
}

export function updateCategory(id: number, cat: Pick<Category, 'name' | 'icon' | 'color'>) {
  if (Platform.OS === 'web') {
    const idx = webStore.categories.findIndex(c => c.id === id);
    if (idx >= 0) webStore.categories[idx] = { ...webStore.categories[idx], ...cat };
    return;
  }
  const db = getDb();
  db.runSync(`UPDATE categories SET name=?, icon=?, color=? WHERE id=?`, [cat.name, cat.icon, cat.color, id]);
}

export function deleteCategory(id: number) {
  if (Platform.OS === 'web') {
    webStore.categories = webStore.categories.filter(c => c.id !== id);
    return;
  }
  const db = getDb();
  db.runSync(`DELETE FROM categories WHERE id=?`, [id]);
}

export function getMonthSummary(month: string): { spent: number; received: number; count: number } {
  if (Platform.OS === 'web') {
    const txs = webStore.transactions.filter(t => t.date.startsWith(month) && !t.transfer_to);
    return {
      spent: txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
      received: txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
      count: txs.length,
    };
  }
  const db = getDb();
  const row = db.getFirstSync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='debit' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) as spent,
       COALESCE(SUM(CASE WHEN type='credit' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) as received,
       COUNT(CASE WHEN transfer_to IS NULL THEN 1 END) as count
     FROM transactions WHERE date LIKE ?`,
    [`${month}%`]
  ) as { spent: number; received: number; count: number };
  return row ?? { spent: 0, received: 0, count: 0 };
}

export function getCategoryBreakdown(month: string): { category: string; total: number; count: number }[] {
  if (Platform.OS === 'web') {
    const txs = webStore.transactions.filter(t => t.date.startsWith(month) && t.type === 'debit' && !t.transfer_to);
    const map: Record<string, { total: number; count: number }> = {};
    for (const t of txs) {
      if (!map[t.category]) map[t.category] = { total: 0, count: 0 };
      map[t.category].total += t.amount;
      map[t.category].count++;
    }
    return Object.entries(map)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
  }
  const db = getDb();
  return db.getAllSync(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM transactions WHERE date LIKE ? AND type='debit' AND transfer_to IS NULL
     GROUP BY category ORDER BY total DESC`,
    [`${month}%`]
  ) as { category: string; total: number; count: number }[];
}

export interface MonthlyTrendPoint {
  month: string;
  label: string;
  spent: number;
  received: number;
  count: number;
}

export function getMonthlyTrend(numMonths: number): MonthlyTrendPoint[] {
  const points: MonthlyTrendPoint[] = [];
  const now = new Date();
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short' });
    if (Platform.OS === 'web') {
      const txs = webStore.transactions.filter(t => t.date.startsWith(month) && !t.transfer_to);
      points.push({
        month,
        label,
        spent: txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
        received: txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
        count: txs.length,
      });
    } else {
      const db = getDb();
      const row = db.getFirstSync(
        `SELECT COALESCE(SUM(CASE WHEN type='debit' AND transfer_to IS NULL THEN amount ELSE 0 END),0) as spent,
                COALESCE(SUM(CASE WHEN type='credit' AND transfer_to IS NULL THEN amount ELSE 0 END),0) as received,
                COUNT(CASE WHEN transfer_to IS NULL THEN 1 END) as count
         FROM transactions WHERE date LIKE ?`,
        [`${month}%`]
      ) as { spent: number; received: number; count: number } | null;
      points.push({ month, label, ...(row ?? { spent: 0, received: 0, count: 0 }) });
    }
  }
  return points;
}

export interface TopTransaction {
  id: number;
  amount: number;
  category: string;
  description: string;
  date: string;
  type: 'debit' | 'credit';
}

export function getTopTransactions(month: string, limit = 5, type: 'debit' | 'credit' = 'debit'): TopTransaction[] {
  if (Platform.OS === 'web') {
    return webStore.transactions
      .filter(t => t.date.startsWith(month) && t.type === type && !t.transfer_to)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit)
      .map(t => ({ id: t.id, amount: t.amount, category: t.category, description: t.description, date: t.date, type: t.type }));
  }
  const db = getDb();
  return db.getAllSync(
    `SELECT id, amount, category, description, date, type
     FROM transactions WHERE date LIKE ? AND type=? AND transfer_to IS NULL
     ORDER BY amount DESC LIMIT ?`,
    [`${month}%`, type, limit]
  ) as TopTransaction[];
}

export interface DayOfWeekStat {
  day: string;
  shortDay: string;
  total: number;
  count: number;
}

export function getDayOfWeekStats(month: string): DayOfWeekStat[] {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const map: Record<number, { total: number; count: number }> = {};
  for (let i = 0; i < 7; i++) map[i] = { total: 0, count: 0 };

  if (Platform.OS === 'web') {
    const txs = webStore.transactions.filter(t => t.date.startsWith(month) && t.type === 'debit' && !t.transfer_to);
    for (const t of txs) {
      const dow = new Date(t.date + 'T00:00:00').getDay();
      map[dow].total += t.amount;
      map[dow].count++;
    }
  } else {
    const db = getDb();
    const rows = db.getAllSync(
      `SELECT date, amount FROM transactions WHERE date LIKE ? AND type='debit' AND transfer_to IS NULL`,
      [`${month}%`]
    ) as { date: string; amount: number }[];
    for (const r of rows) {
      const dow = new Date(r.date + 'T00:00:00').getDay();
      map[dow].total += r.amount;
      map[dow].count++;
    }
  }
  return days.map((day, i) => ({ day, shortDay: short[i], total: map[i].total, count: map[i].count }));
}

export interface WeeklySpendPoint {
  week: string;
  label: string;
  spent: number;
  count: number;
}

export function getWeeklySpend(month: string): WeeklySpendPoint[] {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const weeks: WeeklySpendPoint[] = [
    { week: '1', label: '1–7', spent: 0, count: 0 },
    { week: '2', label: '8–14', spent: 0, count: 0 },
    { week: '3', label: '15–21', spent: 0, count: 0 },
    { week: '4', label: `22–${daysInMonth}`, spent: 0, count: 0 },
  ];

  let rows: { date: string; amount: number }[] = [];
  if (Platform.OS === 'web') {
    rows = webStore.transactions
      .filter(t => t.date.startsWith(month) && t.type === 'debit' && !t.transfer_to)
      .map(t => ({ date: t.date, amount: t.amount }));
  } else {
    const db = getDb();
    rows = db.getAllSync(
      `SELECT date, amount FROM transactions WHERE date LIKE ? AND type='debit' AND transfer_to IS NULL`,
      [`${month}%`]
    ) as { date: string; amount: number }[];
  }

  for (const r of rows) {
    const day = parseInt(r.date.slice(8, 10));
    const wi = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
    weeks[wi].spent += r.amount;
    weeks[wi].count++;
  }
  return weeks;
}

export interface SourceStat {
  smsImported: number;
  smsCount: number;
  manual: number;
  manualCount: number;
}

export function getSourceStats(month: string): SourceStat {
  if (Platform.OS === 'web') {
    const txs = webStore.transactions.filter(t => t.date.startsWith(month) && t.type === 'debit' && !t.transfer_to);
    const sms = txs.filter(t => t.smsId);
    const manual = txs.filter(t => !t.smsId);
    return {
      smsImported: sms.reduce((s, t) => s + t.amount, 0),
      smsCount: sms.length,
      manual: manual.reduce((s, t) => s + t.amount, 0),
      manualCount: manual.length,
    };
  }
  const db = getDb();
  const row = db.getFirstSync(
    `SELECT
       COALESCE(SUM(CASE WHEN smsId IS NOT NULL AND type='debit' AND transfer_to IS NULL THEN amount ELSE 0 END),0) as smsImported,
       COUNT(CASE WHEN smsId IS NOT NULL AND type='debit' AND transfer_to IS NULL THEN 1 END) as smsCount,
       COALESCE(SUM(CASE WHEN smsId IS NULL AND type='debit' AND transfer_to IS NULL THEN amount ELSE 0 END),0) as manual,
       COUNT(CASE WHEN smsId IS NULL AND type='debit' AND transfer_to IS NULL THEN 1 END) as manualCount
     FROM transactions WHERE date LIKE ?`,
    [`${month}%`]
  ) as SourceStat | null;
  return row ?? { smsImported: 0, smsCount: 0, manual: 0, manualCount: 0 };
}

export interface SourceBalance {
  source: string;
  credits: number;
  debits: number;
  transferOut: number;
  transferIn: number;
}

export function getSourceTransactionBalance(source: string): SourceBalance {
  if (Platform.OS === 'web') {
    const txs = webStore.transactions;
    return {
      source,
      credits: txs.filter(t => t.bank === source && t.type === 'credit' && !t.transfer_to).reduce((s, t) => s + t.amount, 0),
      debits: txs.filter(t => t.bank === source && t.type === 'debit' && !t.transfer_to).reduce((s, t) => s + t.amount, 0),
      transferOut: txs.filter(t => t.bank === source && t.transfer_to).reduce((s, t) => s + t.amount, 0),
      transferIn: txs.filter(t => t.transfer_to === source).reduce((s, t) => s + t.amount, 0),
    };
  }
  const db = getDb();
  const row = db.getFirstSync(
    `SELECT
       COALESCE(SUM(CASE WHEN bank=? AND type='credit' AND transfer_to IS NULL THEN amount ELSE 0 END),0) as credits,
       COALESCE(SUM(CASE WHEN bank=? AND type='debit' AND transfer_to IS NULL THEN amount ELSE 0 END),0) as debits,
       COALESCE(SUM(CASE WHEN bank=? AND transfer_to IS NOT NULL THEN amount ELSE 0 END),0) as transferOut,
       COALESCE(SUM(CASE WHEN transfer_to=? THEN amount ELSE 0 END),0) as transferIn
     FROM transactions`,
    [source, source, source, source]
  ) as { credits: number; debits: number; transferOut: number; transferIn: number } | null;
  return { source, ...(row ?? { credits: 0, debits: 0, transferOut: 0, transferIn: 0 }) };
}

export interface BackupData {
  version: number;
  exportedAt: string;
  transactions: Omit<Transaction, 'id'>[];
  customCategories: Omit<Category, 'id'>[];
}

export function createBackup(): BackupData {
  let allTx: Transaction[] = [];
  let allCats: Category[] = [];

  if (Platform.OS === 'web') {
    allTx = [...webStore.transactions];
    allCats = webStore.categories.filter(c => !c.isDefault);
  } else {
    const db = getDb();
    allTx = db.getAllSync(`SELECT * FROM transactions ORDER BY date DESC`) as Transaction[];
    allCats = db.getAllSync(`SELECT * FROM categories WHERE isDefault=0`) as Category[];
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: allTx.map(({ id, ...rest }) => rest),
    customCategories: allCats.map(({ id, ...rest }) => rest),
  };
}

export function restoreBackup(data: BackupData): { inserted: number; skipped: number; errors: string[] } {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (!data.version || !Array.isArray(data.transactions)) {
    return { inserted: 0, skipped: 0, errors: ['Invalid backup file format'] };
  }

  if (Platform.OS === 'web') {
    return { inserted: 0, skipped: 0, errors: ['Restore is only supported on the Android app'] };
  }

  const db = getDb();

  if (Array.isArray(data.customCategories)) {
    for (const cat of data.customCategories) {
      try {
        db.runSync(
          `INSERT OR IGNORE INTO categories (name, icon, color, isDefault) VALUES (?, ?, ?, 0)`,
          [cat.name, cat.icon || 'more-horizontal', cat.color || '#6B7280']
        );
      } catch {}
    }
  }

  for (const tx of data.transactions) {
    try {
      if (!tx.amount || !tx.type || !tx.date) { skipped++; continue; }
      db.runSync(
        `INSERT OR IGNORE INTO transactions (amount, type, category, description, note, date, bank, smsId, transfer_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tx.amount, tx.type, tx.category || 'Other', tx.description || '', tx.note || '', tx.date, tx.bank || '', tx.smsId ?? null, (tx as any).transfer_to ?? null]
      );
      inserted++;
    } catch (e: any) {
      skipped++;
      if (errors.length < 3) errors.push(e.message ?? 'unknown');
    }
  }

  return { inserted, skipped, errors };
}

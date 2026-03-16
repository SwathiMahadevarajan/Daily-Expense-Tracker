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
  { name: 'Other', icon: 'more-horizontal', color: '#6B7280', isDefault: true },
];

let db: any = null;

const webStore = {
  transactions: [] as Transaction[],
  categories: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 })) as Category[],
  nextTxId: 1,
  nextCatId: DEFAULT_CATEGORIES.length + 1,
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
      smsId TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT 'more-horizontal',
      color TEXT NOT NULL DEFAULT '#6B7280',
      isDefault INTEGER NOT NULL DEFAULT 0
    );
  `);

  migrateDatabase(db);
  seedDefaultCategories(db);
}

function migrateDatabase(db: any) {
  try { db.execSync(`ALTER TABLE transactions ADD COLUMN smsId TEXT UNIQUE;`); } catch {}
  try { db.execSync(`ALTER TABLE categories ADD COLUMN isDefault INTEGER NOT NULL DEFAULT 0;`); } catch {}

  db.execSync(`
    UPDATE categories SET icon = 'coffee' WHERE icon = 'utensils';
    UPDATE categories SET icon = 'truck' WHERE icon = 'car';
    UPDATE categories SET icon = 'more-horizontal' WHERE icon NOT IN (
      'coffee','truck','shopping-bag','zap','film','heart','package','book',
      'map-pin','trending-up','more-horizontal','home','music','gift','wifi',
      'phone','camera','monitor','dollar-sign','credit-card',
      'briefcase','user','users','star','flag','tag','inbox','mail','bell'
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
    `INSERT INTO transactions (amount, type, category, description, note, date, bank, smsId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, tx.smsId ?? null]
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
    `UPDATE transactions SET amount=?, type=?, category=?, description=?, note=?, date=?, bank=? WHERE id=?`,
    [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, id]
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

export function getImportedSmsIds(): Set<string> {
  if (Platform.OS === 'web') return new Set();
  const db = getDb();
  const rows = db.getAllSync(`SELECT smsId FROM transactions WHERE smsId IS NOT NULL`) as { smsId: string }[];
  return new Set(rows.map(r => r.smsId));
}

export function bulkInsertSmsTransactions(txList: Omit<Transaction, 'id'>[]): number {
  if (Platform.OS === 'web') return 0;
  const db = getDb();
  let inserted = 0;
  for (const tx of txList) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO transactions (amount, type, category, description, note, date, bank, smsId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, tx.smsId ?? null]
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
    webStore.categories = webStore.categories.filter(c => c.id !== id || c.isDefault);
    return;
  }
  const db = getDb();
  db.runSync(`DELETE FROM categories WHERE id=? AND isDefault=0`, [id]);
}

export function getMonthSummary(month: string): { spent: number; received: number; count: number } {
  if (Platform.OS === 'web') {
    const txs = webStore.transactions.filter(t => t.date.startsWith(month));
    return {
      spent: txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
      received: txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
      count: txs.length,
    };
  }
  const db = getDb();
  const row = db.getFirstSync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE 0 END), 0) as spent,
       COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END), 0) as received,
       COUNT(*) as count
     FROM transactions WHERE date LIKE ?`,
    [`${month}%`]
  ) as { spent: number; received: number; count: number };
  return row ?? { spent: 0, received: 0, count: 0 };
}

export function getCategoryBreakdown(month: string): { category: string; total: number; count: number }[] {
  if (Platform.OS === 'web') {
    const txs = webStore.transactions.filter(t => t.date.startsWith(month) && t.type === 'debit');
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
     FROM transactions WHERE date LIKE ? AND type='debit'
     GROUP BY category ORDER BY total DESC`,
    [`${month}%`]
  ) as { category: string; total: number; count: number }[];
}

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

let db: any = null;

function getDb() {
  if (db) return db;

  if (Platform.OS === 'web') {
    db = createWebShim();
    return db;
  }

  const SQLite = require('expo-sqlite');
  db = SQLite.openDatabaseSync('expense_tracker.db');
  return db;
}

function createWebShim() {
  const store: Record<string, any[]> = { transactions: [], categories: [] };
  return {
    execSync: () => {},
    runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    getAllSync: (sql: string) => [],
    getFirstSync: (sql: string) => null,
  };
}

export function initializeDatabase() {
  const db = getDb();

  if (Platform.OS === 'web') return;

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
  try {
    db.execSync(`ALTER TABLE transactions ADD COLUMN smsId TEXT UNIQUE;`);
  } catch {}

  try {
    db.execSync(`ALTER TABLE categories ADD COLUMN isDefault INTEGER NOT NULL DEFAULT 0;`);
  } catch {}

  db.execSync(`
    UPDATE categories SET icon = 'coffee' WHERE icon = 'utensils';
    UPDATE categories SET icon = 'truck' WHERE icon = 'car';
    UPDATE categories SET icon = 'more-horizontal' WHERE icon NOT IN (
      'coffee','truck','shopping-bag','zap','film','heart','package','book',
      'map-pin','trending-up','more-horizontal','home','music','gift','wifi',
      'phone','camera','monitor','printer','tv','dollar-sign','credit-card',
      'briefcase','user','users','star','flag','tag','inbox','mail','bell'
    );
  `);
}

function seedDefaultCategories(db: any) {
  const defaults = [
    { name: 'Food & Dining', icon: 'coffee', color: '#F59E0B' },
    { name: 'Transport', icon: 'truck', color: '#3B82F6' },
    { name: 'Shopping', icon: 'shopping-bag', color: '#EC4899' },
    { name: 'Bills', icon: 'zap', color: '#8B5CF6' },
    { name: 'Entertainment', icon: 'film', color: '#F97316' },
    { name: 'Health', icon: 'heart', color: '#EF4444' },
    { name: 'Groceries', icon: 'package', color: '#10B981' },
    { name: 'Education', icon: 'book', color: '#06B6D4' },
    { name: 'Travel', icon: 'map-pin', color: '#84CC16' },
    { name: 'Income', icon: 'trending-up', color: '#22C55E' },
    { name: 'Other', icon: 'more-horizontal', color: '#6B7280' },
  ];

  for (const cat of defaults) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO categories (name, icon, color, isDefault) VALUES (?, ?, ?, 1)`,
        [cat.name, cat.icon, cat.color]
      );
    } catch {}
  }
}

export function getTransactions(month?: string): Transaction[] {
  const db = getDb();
  if (Platform.OS === 'web') return [];

  if (month) {
    return db.getAllSync(
      `SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC`,
      [`${month}%`]
    ) as Transaction[];
  }
  return db.getAllSync(`SELECT * FROM transactions ORDER BY date DESC`) as Transaction[];
}

export function addTransaction(tx: Omit<Transaction, 'id'>): number {
  const db = getDb();
  if (Platform.OS === 'web') return 0;

  const result = db.runSync(
    `INSERT INTO transactions (amount, type, category, description, note, date, bank, smsId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, tx.smsId ?? null]
  );
  return result.lastInsertRowId;
}

export function updateTransaction(id: number, tx: Omit<Transaction, 'id'>) {
  const db = getDb();
  if (Platform.OS === 'web') return;

  db.runSync(
    `UPDATE transactions SET amount=?, type=?, category=?, description=?, note=?, date=?, bank=? WHERE id=?`,
    [tx.amount, tx.type, tx.category, tx.description, tx.note, tx.date, tx.bank, id]
  );
}

export function deleteTransaction(id: number) {
  const db = getDb();
  if (Platform.OS === 'web') return;

  db.runSync(`DELETE FROM transactions WHERE id=?`, [id]);
}

export function getImportedSmsIds(): Set<string> {
  const db = getDb();
  if (Platform.OS === 'web') return new Set();

  const rows = db.getAllSync(`SELECT smsId FROM transactions WHERE smsId IS NOT NULL`) as { smsId: string }[];
  return new Set(rows.map(r => r.smsId));
}

export function bulkInsertSmsTransactions(txList: Omit<Transaction, 'id'>[]): number {
  const db = getDb();
  if (Platform.OS === 'web') return 0;

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
  const db = getDb();
  if (Platform.OS === 'web') return [];

  return db.getAllSync(`SELECT * FROM categories ORDER BY isDefault DESC, name ASC`) as Category[];
}

export function addCategory(cat: Omit<Category, 'id'>): number {
  const db = getDb();
  if (Platform.OS === 'web') return 0;

  const result = db.runSync(
    `INSERT INTO categories (name, icon, color, isDefault) VALUES (?, ?, ?, 0)`,
    [cat.name, cat.icon, cat.color]
  );
  return result.lastInsertRowId;
}

export function updateCategory(id: number, cat: Pick<Category, 'name' | 'icon' | 'color'>) {
  const db = getDb();
  if (Platform.OS === 'web') return;

  db.runSync(`UPDATE categories SET name=?, icon=?, color=? WHERE id=?`, [cat.name, cat.icon, cat.color, id]);
}

export function deleteCategory(id: number) {
  const db = getDb();
  if (Platform.OS === 'web') return;

  db.runSync(`DELETE FROM categories WHERE id=? AND isDefault=0`, [id]);
}

export function getMonthSummary(month: string): { spent: number; received: number; count: number } {
  const db = getDb();
  if (Platform.OS === 'web') return { spent: 0, received: 0, count: 0 };

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
  const db = getDb();
  if (Platform.OS === 'web') return [];

  return db.getAllSync(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM transactions WHERE date LIKE ? AND type='debit'
     GROUP BY category ORDER BY total DESC`,
    [`${month}%`]
  ) as { category: string; total: number; count: number }[];
}

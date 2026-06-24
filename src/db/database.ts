import * as SQLite from "expo-sqlite";

import { SCHEMA_STATEMENTS } from "./schema";

const DB_NAME = "limalego.db";

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open the database once and create tables on first use. */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
    for (const stmt of SCHEMA_STATEMENTS) {
      await db.execAsync(stmt);
    }
    _db = db;
    return db;
  })();

  return _initPromise;
}

/** Run a write statement, returning lastInsertRowId / changes. */
export async function run(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): Promise<SQLite.SQLiteRunResult> {
  const db = await getDb();
  return db.runAsync(sql, params);
}

/** Fetch all matching rows as typed objects. */
export async function all<T>(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.getAllAsync<T>(sql, params);
}

/** Fetch the first matching row, or null. */
export async function first<T>(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): Promise<T | null> {
  const db = await getDb();
  return db.getFirstAsync<T>(sql, params);
}

/** Run a function inside a transaction. */
export async function tx(fn: () => Promise<void>): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(fn);
}

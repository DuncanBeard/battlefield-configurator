import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function transaction<T>(database: Database, action: () => T): T {
  // Explicit statements avoid retained transaction-helper statements when closing SQLite on Windows.
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path, { create: true, strict: true });
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  try {
    for (const name of ['001-auth.sql', '002-configs.sql', '003-local-users.sql']) {
      const sql = readFileSync(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
      transaction(database, () => {
        if (database.query('SELECT name FROM schema_migrations WHERE name = ?').get(name)) return;
        database.exec(sql);
        database.query('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
      });
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

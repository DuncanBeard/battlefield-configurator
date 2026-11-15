import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';

export function backupDatabase(source: string, destination: string) {
  if (resolve(source) === resolve(destination)) throw new Error('Backup destination must differ from the source.');
  const database = new Database(source, { readonly: true });
  try {
    database.exec('PRAGMA busy_timeout = 5000');
    database.query('VACUUM INTO ?').run(resolve(destination));
  } finally {
    database.close();
  }
}

if (import.meta.main) {
  const source = process.env.DATABASE_PATH;
  const destination = process.argv[2];
  if (!source || !destination) throw new Error('Usage: set DATABASE_PATH, then bun run server/backup.ts <new-backup-file>');
  backupDatabase(source, destination);
  console.info('Consistent database backup created. Protect it as private account data.');
}

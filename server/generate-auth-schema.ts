import { Database } from 'bun:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from './auth';
import { readConfig } from './config';

const database = new Database(':memory:');
const config = readConfig({ BETTER_AUTH_SECRET: 'schema-generation-only-not-a-runtime-secret' });
const migration = await getMigrations(createAuth(database, config).options);
await Bun.write(new URL('./migrations/001-auth.sql', import.meta.url), await migration.compileMigrations());
database.close();

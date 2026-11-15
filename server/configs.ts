import type { Database } from 'bun:sqlite';
import { maxConfigs, validateEntries } from '../lib/saved-configs';
import type { ConfigInput, ConfigMetadata, SavedConfig } from '../lib/saved-configs';
import { transaction } from './db';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface Row extends ConfigMetadata { entriesJson: string }
const columns = 'id, name, device_key AS deviceKey, schema_version AS schemaVersion, revision, created_at AS createdAt, updated_at AS updatedAt';

export function configStore(database: Database) {
  function get(userId: string, id: string): SavedConfig {
    const row = database.query<Row, [string, string]>(`SELECT ${columns}, entries_json AS entriesJson FROM saved_configs WHERE user_id = ? AND id = ?`).get(userId, id);
    if (!row) throw new HttpError(404, 'Config not found.');
    const { entriesJson, ...metadata } = row;
    return { ...metadata, entries: validateEntries(JSON.parse(entriesJson)) };
  }

  function checkRevision(current: SavedConfig, revision: number) {
    if (current.revision !== revision) throw new HttpError(409, 'This config changed elsewhere. Reload it or use Save as.');
  }

  return {
    get,
    list(userId: string, offset: number, limit: number) {
      return database.query<ConfigMetadata, [string, number, number]>(`SELECT ${columns} FROM saved_configs WHERE user_id = ? ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`).all(userId, limit, offset);
    },
    create(userId: string, input: ConfigInput) {
      return transaction(database, () => {
        const count = database.query<{ count: number }, [string]>('SELECT count(*) AS count FROM saved_configs WHERE user_id = ?').get(userId)!.count;
        if (count >= maxConfigs) throw new HttpError(409, 'Account limit reached (50 configs). Delete a config before saving another.');
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        database.query('INSERT INTO saved_configs (id, user_id, name, device_key, schema_version, entries_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, userId, input.name, input.deviceKey, input.schemaVersion, JSON.stringify(input.entries), now, now);
        return get(userId, id);
      });
    },
    update(userId: string, id: string, revision: number, input: ConfigInput | { name: string }) {
      return transaction(database, () => {
        const current = get(userId, id);
        checkRevision(current, revision);
        const next = { ...current, ...input };
        database.query('UPDATE saved_configs SET name = ?, device_key = ?, entries_json = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?')
          .run(next.name, next.deviceKey, JSON.stringify(next.entries), new Date().toISOString(), id, userId, revision);
        return get(userId, id);
      });
    },
    delete(userId: string, id: string, revision: number) {
      transaction(database, () => {
        checkRevision(get(userId, id), revision);
        database.query('DELETE FROM saved_configs WHERE id = ? AND user_id = ? AND revision = ?').run(id, userId, revision);
      });
    },
  };
}

CREATE TABLE saved_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  device_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  entries_json TEXT NOT NULL CHECK(length(CAST(entries_json AS BLOB)) <= 262144),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX saved_configs_owner_updated ON saved_configs(user_id, updated_at DESC, id);

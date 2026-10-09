-- Kody synchronizacji: w bazie tylko hash kodu (sam kod zna wyłącznie gracz).
CREATE TABLE sync_codes (
  id TEXT PRIMARY KEY,              -- SHA-256 kodu (hex)
  rev INTEGER NOT NULL DEFAULT 0,   -- rośnie przy każdej zmianie (ETag)
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX sync_codes_created ON sync_codes (created_at);
CREATE INDEX sync_codes_updated ON sync_codes (updated_at);

-- Postęp osobno dla każdej postaci – scalanie dotyka tylko zmienionej postaci.
CREATE TABLE sync_chars (
  code_id TEXT NOT NULL,
  char_key TEXT NOT NULL,
  doc TEXT NOT NULL,                -- CharacterProgress (JSON, zwalidowany)
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (code_id, char_key)
);

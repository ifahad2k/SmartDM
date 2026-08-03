ALTER TABLE download ADD COLUMN created_at TEXT;
UPDATE download SET created_at = datetime('now') WHERE created_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_file_root_relpath ON catalog_file(root_id, relative_path);

CREATE TABLE IF NOT EXISTS catalog_scan_error (
    id TEXT PRIMARY KEY,
    scan_id TEXT,
    root_id TEXT NOT NULL,
    relative_path TEXT,
    error_code TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    retryable INTEGER NOT NULL
);

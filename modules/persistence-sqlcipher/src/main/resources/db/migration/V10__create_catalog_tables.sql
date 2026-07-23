-- Phase 11: Local File Catalog and Duplicate Detection

CREATE TABLE catalog_root (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    scan_state TEXT NOT NULL DEFAULT 'IDLE',
    last_scanned_at TEXT
);

CREATE TABLE catalog_file (
    id TEXT PRIMARY KEY,
    root_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_extension TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    quick_hash TEXT,
    full_hash TEXT,
    metadata_json TEXT,
    FOREIGN KEY (root_id) REFERENCES catalog_root(id) ON DELETE CASCADE
);

CREATE TABLE catalog_media_metadata (
    file_id TEXT PRIMARY KEY,
    duration_seconds INTEGER,
    width INTEGER,
    height INTEGER,
    codec TEXT,
    bitrate INTEGER,
    FOREIGN KEY (file_id) REFERENCES catalog_file(id) ON DELETE CASCADE
);

CREATE TABLE catalog_scan (
    id TEXT PRIMARY KEY,
    root_id TEXT NOT NULL,
    status TEXT NOT NULL,
    files_scanned INTEGER NOT NULL DEFAULT 0,
    bytes_scanned INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (root_id) REFERENCES catalog_root(id) ON DELETE CASCADE
);

CREATE INDEX idx_catalog_file_size ON catalog_file(file_size);
CREATE INDEX idx_catalog_file_name ON catalog_file(file_name);
CREATE INDEX idx_catalog_quick_hash ON catalog_file(quick_hash);
CREATE INDEX idx_catalog_full_hash ON catalog_file(full_hash);

-- FTS5 Virtual Table for local natural language and path searching
CREATE VIRTUAL TABLE catalog_file_fts USING fts5(
    file_name,
    relative_path,
    file_extension,
    content='catalog_file',
    content_rowid='rowid'
);

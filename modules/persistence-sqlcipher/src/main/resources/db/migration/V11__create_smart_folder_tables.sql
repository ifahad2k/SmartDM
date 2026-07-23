-- V11: Create tables for Local Smart Folder Selection & Affinity Learning

CREATE TABLE IF NOT EXISTS folder_affinity (
    folder_path TEXT PRIMARY KEY,
    category_id TEXT,
    extension_affinity TEXT, -- JSON map or comma-separated extensions
    source_host_affinity TEXT, -- JSON map or comma-separated hosts
    choice_count INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    is_pinned BOOLEAN NOT NULL DEFAULT 0,
    is_blacklisted BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS folder_choice_history (
    id TEXT PRIMARY KEY,
    download_url TEXT,
    source_host TEXT,
    mime_type TEXT,
    file_extension TEXT,
    chosen_folder_path TEXT NOT NULL,
    suggested_folder_path TEXT,
    action TEXT NOT NULL, -- ACCEPTED, OVERRIDDEN, REJECTED
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folder_affinity_last_used ON folder_affinity(last_used_at);
CREATE INDEX IF NOT EXISTS idx_folder_choice_history_created ON folder_choice_history(created_at);

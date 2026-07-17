CREATE TABLE schema_migration (
    version TEXT PRIMARY KEY,
    description TEXT,
    script TEXT,
    checksum INTEGER,
    installed_by TEXT,
    installed_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_time INTEGER,
    success BOOLEAN
);

CREATE TABLE app_setting (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE secure_reference (
    id TEXT PRIMARY KEY,
    key_hash TEXT,
    reference_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profile_metadata (
    id TEXT PRIMARY KEY,
    os_name TEXT,
    install_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_launched TIMESTAMP
);

CREATE TABLE diagnostic_event (
    id TEXT PRIMARY KEY,
    level TEXT,
    event_type TEXT,
    redacted_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

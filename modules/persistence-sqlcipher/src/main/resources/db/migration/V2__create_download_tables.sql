CREATE TABLE IF NOT EXISTS download (
    id TEXT PRIMARY KEY,
    source_uri TEXT NOT NULL,
    destination_path TEXT NOT NULL,
    state TEXT NOT NULL,
    total_bytes BIGINT NOT NULL,
    downloaded_bytes BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_header (
    download_id TEXT NOT NULL,
    header_name TEXT NOT NULL,
    header_value TEXT NOT NULL,
    FOREIGN KEY(download_id) REFERENCES download(id) ON DELETE CASCADE
);

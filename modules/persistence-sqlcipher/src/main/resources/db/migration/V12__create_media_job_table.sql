CREATE TABLE media_job (
    download_id TEXT PRIMARY KEY,
    webpage_url TEXT NOT NULL,
    format_argument TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (download_id)
        REFERENCES download(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_media_job_status
    ON media_job(status);

CREATE INDEX idx_media_job_updated_at
    ON media_job(updated_at);

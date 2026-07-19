CREATE TABLE IF NOT EXISTS download_segment (
    download_id TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_offset BIGINT NOT NULL,
    current_offset BIGINT NOT NULL,
    end_offset BIGINT NOT NULL,
    PRIMARY KEY (download_id, segment_index),
    FOREIGN KEY(download_id) REFERENCES download(id) ON DELETE CASCADE
);

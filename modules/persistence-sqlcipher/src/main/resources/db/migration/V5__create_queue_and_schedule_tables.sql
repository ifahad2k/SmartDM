CREATE TABLE download_queue (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    concurrency_limit INTEGER NOT NULL,
    bandwidth_limit_bytes INTEGER,
    status TEXT NOT NULL
);

CREATE TABLE queue_item (
    id TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    download_id TEXT NOT NULL,
    priority INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    FOREIGN KEY(queue_id) REFERENCES download_queue(id) ON DELETE CASCADE,
    FOREIGN KEY(download_id) REFERENCES download(id) ON DELETE CASCADE
);

CREATE TABLE schedule (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_time_iso TEXT,
    end_time_iso TEXT,
    days_of_week TEXT,
    active INTEGER NOT NULL,
    missed_trigger_policy TEXT NOT NULL
);

CREATE TABLE schedule_execution (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    execution_time_millis INTEGER NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(schedule_id) REFERENCES schedule(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_queue_item_queue_id ON queue_item(queue_id);
CREATE INDEX idx_queue_item_download_id ON queue_item(download_id);
CREATE INDEX idx_queue_item_order ON queue_item(queue_id, order_index);
CREATE INDEX idx_schedule_execution_schedule_id ON schedule_execution(schedule_id);

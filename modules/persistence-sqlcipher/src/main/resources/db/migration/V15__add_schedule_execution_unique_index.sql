CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_execution_occurrence ON schedule_execution (schedule_id, execution_time_millis);

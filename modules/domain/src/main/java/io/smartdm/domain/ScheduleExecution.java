package io.smartdm.domain;

import java.util.Objects;
import java.util.UUID;

public class ScheduleExecution {
    
    public enum Status {
        SUCCESS,
        FAILED
    }

    private final String id;
    private final String scheduleId;
    private final long executionTimeMillis;
    private final Status status;

    public ScheduleExecution(String id, String scheduleId, long executionTimeMillis, Status status) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.scheduleId = Objects.requireNonNull(scheduleId, "scheduleId must not be null");
        this.executionTimeMillis = executionTimeMillis;
        this.status = Objects.requireNonNull(status, "status must not be null");
    }

    public static ScheduleExecution createNew(String scheduleId, long executionTimeMillis, Status status) {
        return new ScheduleExecution(UUID.randomUUID().toString(), scheduleId, executionTimeMillis, status);
    }

    public String getId() {
        return id;
    }

    public String getScheduleId() {
        return scheduleId;
    }

    public long getExecutionTimeMillis() {
        return executionTimeMillis;
    }

    public Status getStatus() {
        return status;
    }
}

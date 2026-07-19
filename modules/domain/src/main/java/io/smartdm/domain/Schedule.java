package io.smartdm.domain;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

public class Schedule {
    
    public enum MissedTriggerPolicy {
        IGNORE,
        RUN_IMMEDIATELY
    }

    private final String id;
    private final String name;
    private final LocalTime startTime;
    private final LocalTime endTime;
    private final List<Integer> daysOfWeek; // 1 (Monday) to 7 (Sunday)
    private final boolean active;
    private final MissedTriggerPolicy missedTriggerPolicy;

    public Schedule(String id, String name, LocalTime startTime, LocalTime endTime, List<Integer> daysOfWeek, boolean active, MissedTriggerPolicy missedTriggerPolicy) {
        this.id = Objects.requireNonNull(id, "id must not be null");
        this.name = Objects.requireNonNull(name, "name must not be null");
        this.startTime = startTime;
        this.endTime = endTime;
        this.daysOfWeek = daysOfWeek != null ? List.copyOf(daysOfWeek) : List.of();
        this.active = active;
        this.missedTriggerPolicy = Objects.requireNonNull(missedTriggerPolicy, "missedTriggerPolicy must not be null");
    }

    public static Schedule createNew(String name, LocalTime startTime, LocalTime endTime, List<Integer> daysOfWeek, MissedTriggerPolicy missedTriggerPolicy) {
        return new Schedule(UUID.randomUUID().toString(), name, startTime, endTime, daysOfWeek, true, missedTriggerPolicy);
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Optional<LocalTime> getStartTime() {
        return Optional.ofNullable(startTime);
    }

    public Optional<LocalTime> getEndTime() {
        return Optional.ofNullable(endTime);
    }

    public List<Integer> getDaysOfWeek() {
        return daysOfWeek;
    }

    public boolean isActive() {
        return active;
    }

    public MissedTriggerPolicy getMissedTriggerPolicy() {
        return missedTriggerPolicy;
    }
    
    public String getDaysOfWeekAsString() {
        if (daysOfWeek.isEmpty()) {
            return "";
        }
        return daysOfWeek.stream().map(String::valueOf).collect(Collectors.joining(","));
    }
    
    public static List<Integer> parseDaysOfWeek(String days) {
        if (days == null || days.isBlank()) {
            return List.of();
        }
        return Arrays.stream(days.split(","))
                .map(Integer::parseInt)
                .collect(Collectors.toList());
    }
}

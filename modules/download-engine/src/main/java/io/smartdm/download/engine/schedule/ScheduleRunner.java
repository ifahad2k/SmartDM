package io.smartdm.download.engine.schedule;

import io.smartdm.domain.Schedule;
import io.smartdm.domain.DownloadQueue;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public class ScheduleRunner {
    
    @FunctionalInterface
    public interface ScheduleOccurrenceClaimer {
        boolean claim(io.smartdm.domain.ScheduleExecution occurrence);
    }

    private final Clock clock;
    private final Consumer<DownloadQueue.Status> queueStatusUpdater;
    private final Runnable scheduledDownloadsStarter;
    private final Consumer<Schedule> scheduleUpdater;
    private final ScheduleOccurrenceClaimer occurrenceClaimer;
    private final Consumer<io.smartdm.domain.ScheduleExecution> scheduleExecutionUpdater;
    private final Map<String, Schedule> schedules = new ConcurrentHashMap<>();
    private ScheduledExecutorService executor;
    private DownloadQueue.Status lastEmittedQueueStatus = null;

    public ScheduleRunner(Clock clock, Consumer<DownloadQueue.Status> queueStatusUpdater, Runnable scheduledDownloadsStarter, Consumer<Schedule> scheduleUpdater, Consumer<io.smartdm.domain.ScheduleExecution> scheduleExecutionUpdater) {
        this(clock, queueStatusUpdater, scheduledDownloadsStarter, scheduleUpdater, null, scheduleExecutionUpdater);
    }

    public ScheduleRunner(Clock clock, Consumer<DownloadQueue.Status> queueStatusUpdater, Runnable scheduledDownloadsStarter, Consumer<Schedule> scheduleUpdater, ScheduleOccurrenceClaimer occurrenceClaimer, Consumer<io.smartdm.domain.ScheduleExecution> scheduleExecutionUpdater) {
        this.clock = clock;
        this.queueStatusUpdater = queueStatusUpdater;
        this.scheduledDownloadsStarter = scheduledDownloadsStarter;
        this.scheduleUpdater = scheduleUpdater;
        this.occurrenceClaimer = occurrenceClaimer;
        this.scheduleExecutionUpdater = scheduleExecutionUpdater;
    }
    
    public void start() {
        executor = Executors.newSingleThreadScheduledExecutor();
        executor.scheduleAtFixedRate(this::evaluateSchedules, 0, 1, TimeUnit.SECONDS);
    }
    
    public void stop() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }
    
    public void updateSchedule(Schedule schedule) {
        schedules.put(schedule.getId(), schedule);
        evaluateSchedules();
    }
    
    public void removeSchedule(String id) {
        schedules.remove(id);
    }
    
    public java.util.Collection<Schedule> getSchedules() {
        return schedules.values();
    }
    
    private void evaluateSchedules() {
        if (scheduledDownloadsStarter != null) {
            try {
                scheduledDownloadsStarter.run();
            } catch (Throwable failure) {
                System.err.println("Warning: Scheduled downloads starter error: " + failure.getMessage());
            }
        }
        
        for (Schedule schedule : schedules.values()) {
            if (!schedule.isActive()) continue;
            try {
                evaluateSingleSchedule(schedule);
            } catch (Throwable failure) {
                System.err.println("Warning: Schedule evaluation failed for schedule " + schedule.getId() + ": " + failure.getMessage());
            }
        }
    }

    private void evaluateSingleSchedule(Schedule schedule) {
        java.time.ZoneId zoneId = java.time.ZoneId.systemDefault();
        try {
            if (schedule.getTimezoneId() != null) {
                zoneId = java.time.ZoneId.of(schedule.getTimezoneId());
            }
        } catch (Exception ignored) { }
        
        LocalDateTime now = LocalDateTime.now(clock.withZone(zoneId));
        int currentDayOfWeek = now.getDayOfWeek().getValue();
        LocalTime currentTime = now.toLocalTime();
        
        // Check day of week
        List<Integer> days = schedule.getDaysOfWeek();
        if (!days.isEmpty() && !days.contains(currentDayOfWeek)) {
            return;
        }
        
        // Check time window
        if (schedule.getStartTime().isPresent() && schedule.getEndTime().isPresent()) {
            LocalTime start = schedule.getStartTime().get();
            LocalTime end = schedule.getEndTime().get();
            
            boolean inWindow;
            if (start.equals(end)) {
                // Start == End means run 24 hours a day
                inWindow = true;
            } else if (start.isBefore(end)) {
                inWindow = !currentTime.isBefore(start) && currentTime.isBefore(end);
            } else {
                // Spans midnight
                inWindow = !currentTime.isBefore(start) || currentTime.isBefore(end);
            }
            
            DownloadQueue.Status targetStatus = inWindow ? DownloadQueue.Status.ACTIVE : DownloadQueue.Status.PAUSED;
            if (lastEmittedQueueStatus != targetStatus) {
                lastEmittedQueueStatus = targetStatus;
                queueStatusUpdater.accept(targetStatus);
            }
        } else if (schedule.getStartTime().isPresent()) {
            // One-time start
            LocalTime start = schedule.getStartTime().get();
            boolean shouldTriggerNow = false;
            
            long lastRunMillis = schedule.getLastRunTime();
            boolean hasRunToday = false;
            if (lastRunMillis > 0) {
                java.time.LocalDate lastRunDate = java.time.Instant.ofEpochMilli(lastRunMillis).atZone(zoneId).toLocalDate();
                hasRunToday = !lastRunDate.isBefore(now.toLocalDate());
            }
            
            if (currentTime.getHour() == start.getHour() && currentTime.getMinute() == start.getMinute()) {
                if (!hasRunToday) shouldTriggerNow = true;
            } else if (schedule.getMissedTriggerPolicy() == Schedule.MissedTriggerPolicy.RUN_IMMEDIATELY) {
                if (currentTime.isAfter(start) && !hasRunToday) {
                    shouldTriggerNow = true;
                }
            }
            
            if (shouldTriggerNow) {
                LocalDateTime scheduledDateTime = now.toLocalDate().atTime(start);
                long scheduledInstant = scheduledDateTime.atZone(zoneId).toInstant().toEpochMilli();
                io.smartdm.domain.ScheduleExecution claim = new io.smartdm.domain.ScheduleExecution(
                        java.util.UUID.randomUUID().toString(),
                        schedule.getId(),
                        scheduledInstant,
                        io.smartdm.domain.ScheduleExecution.Status.CLAIMED
                );

                if (occurrenceClaimer != null) {
                    boolean claimed = occurrenceClaimer.claim(claim);
                    if (!claimed) {
                        return;
                    }
                }

                try {
                    queueStatusUpdater.accept(DownloadQueue.Status.ACTIVE);
                    schedule.setLastRunTime(scheduledInstant);
                    if (scheduleUpdater != null) {
                        scheduleUpdater.accept(schedule);
                    }
                    if (scheduleExecutionUpdater != null) {
                        scheduleExecutionUpdater.accept(claim.withStatus(io.smartdm.domain.ScheduleExecution.Status.SUCCESS));
                    }
                } catch (RuntimeException failure) {
                    if (scheduleExecutionUpdater != null) {
                        scheduleExecutionUpdater.accept(claim.withStatus(io.smartdm.domain.ScheduleExecution.Status.FAILED));
                    }
                    throw failure;
                }
            }
        } else if (schedule.getEndTime().isPresent()) {
            // One-time stop
            LocalTime end = schedule.getEndTime().get();
            boolean shouldTriggerNow = false;
            
            long lastRunMillis = schedule.getLastRunTime();
            boolean hasRunToday = false;
            if (lastRunMillis > 0) {
                java.time.LocalDate lastRunDate = java.time.Instant.ofEpochMilli(lastRunMillis).atZone(zoneId).toLocalDate();
                hasRunToday = !lastRunDate.isBefore(now.toLocalDate());
            }
            
            if (currentTime.getHour() == end.getHour() && currentTime.getMinute() == end.getMinute()) {
                if (!hasRunToday) shouldTriggerNow = true;
            } else if (schedule.getMissedTriggerPolicy() == Schedule.MissedTriggerPolicy.RUN_IMMEDIATELY) {
                if (currentTime.isAfter(end) && !hasRunToday) {
                    shouldTriggerNow = true;
                }
            }
            
            if (shouldTriggerNow) {
                queueStatusUpdater.accept(DownloadQueue.Status.PAUSED);
                schedule.setLastRunTime(System.currentTimeMillis());
                if (scheduleUpdater != null) {
                    scheduleUpdater.accept(schedule);
                }
                if (scheduleExecutionUpdater != null) {
                    scheduleExecutionUpdater.accept(io.smartdm.domain.ScheduleExecution.createNew(
                        schedule.getId(), System.currentTimeMillis(), io.smartdm.domain.ScheduleExecution.Status.SUCCESS));
                }
            }
        }
    }
}

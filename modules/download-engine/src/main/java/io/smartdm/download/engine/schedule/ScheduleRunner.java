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
    
    private final Clock clock;
    private final Consumer<DownloadQueue.Status> queueStatusUpdater;
    private final Runnable scheduledDownloadsStarter;
    private final Consumer<Schedule> scheduleUpdater;
    private final Map<String, Schedule> schedules = new ConcurrentHashMap<>();
    private ScheduledExecutorService executor;
    private DownloadQueue.Status lastEmittedQueueStatus = null;

    public ScheduleRunner(Clock clock, Consumer<DownloadQueue.Status> queueStatusUpdater, Runnable scheduledDownloadsStarter, Consumer<Schedule> scheduleUpdater) {
        this.clock = clock;
        this.queueStatusUpdater = queueStatusUpdater;
        this.scheduledDownloadsStarter = scheduledDownloadsStarter;
        this.scheduleUpdater = scheduleUpdater;
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
            scheduledDownloadsStarter.run();
        }
        
        LocalDateTime now = LocalDateTime.now(clock);
        int currentDayOfWeek = now.getDayOfWeek().getValue();
        LocalTime currentTime = now.toLocalTime();
        
        for (Schedule schedule : schedules.values()) {
            if (!schedule.isActive()) continue;
            
            // Check day of week
            List<Integer> days = schedule.getDaysOfWeek();
            if (!days.isEmpty() && !days.contains(currentDayOfWeek)) {
                continue;
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
                    java.time.LocalDate lastRunDate = java.time.Instant.ofEpochMilli(lastRunMillis).atZone(clock.getZone()).toLocalDate();
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
                    queueStatusUpdater.accept(DownloadQueue.Status.ACTIVE);
                    schedule.setLastRunTime(System.currentTimeMillis());
                    if (scheduleUpdater != null) {
                        scheduleUpdater.accept(schedule);
                    }
                }
            } else if (schedule.getEndTime().isPresent()) {
                // One-time stop
                LocalTime end = schedule.getEndTime().get();
                boolean shouldTriggerNow = false;
                
                long lastRunMillis = schedule.getLastRunTime();
                boolean hasRunToday = false;
                if (lastRunMillis > 0) {
                    java.time.LocalDate lastRunDate = java.time.Instant.ofEpochMilli(lastRunMillis).atZone(clock.getZone()).toLocalDate();
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
                }
            }
        }
    }
}

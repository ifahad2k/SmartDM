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
    private final Map<String, Schedule> schedules = new ConcurrentHashMap<>();
    private ScheduledExecutorService executor;

    public ScheduleRunner(Clock clock, Consumer<DownloadQueue.Status> queueStatusUpdater, Runnable scheduledDownloadsStarter) {
        this.clock = clock;
        this.queueStatusUpdater = queueStatusUpdater;
        this.scheduledDownloadsStarter = scheduledDownloadsStarter;
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
                if (start.isBefore(end)) {
                    inWindow = !currentTime.isBefore(start) && currentTime.isBefore(end);
                } else {
                    // Spans midnight
                    inWindow = !currentTime.isBefore(start) || currentTime.isBefore(end);
                }
                
                if (inWindow) {
                    queueStatusUpdater.accept(DownloadQueue.Status.ACTIVE);
                } else {
                    queueStatusUpdater.accept(DownloadQueue.Status.PAUSED);
                }
            } else if (schedule.getStartTime().isPresent()) {
                // One-time start
                LocalTime start = schedule.getStartTime().get();
                // Simple within-minute trigger logic for demo, real impl needs execution tracking
                if (currentTime.getHour() == start.getHour() && currentTime.getMinute() == start.getMinute()) {
                    queueStatusUpdater.accept(DownloadQueue.Status.ACTIVE);
                }
            } else if (schedule.getEndTime().isPresent()) {
                // One-time stop
                LocalTime end = schedule.getEndTime().get();
                if (currentTime.getHour() == end.getHour() && currentTime.getMinute() == end.getMinute()) {
                    queueStatusUpdater.accept(DownloadQueue.Status.PAUSED);
                }
            }
        }
    }
}

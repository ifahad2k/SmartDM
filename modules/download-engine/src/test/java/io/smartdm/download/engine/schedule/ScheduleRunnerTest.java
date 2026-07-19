package io.smartdm.download.engine.schedule;

import io.smartdm.domain.DownloadQueue;
import io.smartdm.domain.Schedule;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleRunnerTest {

    @Test
    void shouldUpdateQueueStatusBasedOnTimeWindow() {
        AtomicReference<DownloadQueue.Status> statusRef = new AtomicReference<>(DownloadQueue.Status.PAUSED);
        
        // Setup clock fixed at 12:00 PM
        Clock clock = Clock.fixed(Instant.parse("2026-07-19T12:00:00Z"), ZoneId.of("UTC"));
        
        ScheduleRunner runner = new ScheduleRunner(clock, statusRef::set);
        
        // Window from 11:00 AM to 1:00 PM (Active)
        Schedule scheduleActive = Schedule.createNew(
            "Daytime", 
            LocalTime.of(11, 0), 
            LocalTime.of(13, 0), 
            List.of(), 
            Schedule.MissedTriggerPolicy.IGNORE
        );
        
        runner.updateSchedule(scheduleActive);
        assertThat(statusRef.get()).isEqualTo(DownloadQueue.Status.ACTIVE);
        
        runner.removeSchedule(scheduleActive.getId());
        
        // Window from 1:00 PM to 2:00 PM (Paused)
        Schedule schedulePaused = Schedule.createNew(
            "Afternoon", 
            LocalTime.of(13, 0), 
            LocalTime.of(14, 0), 
            List.of(), 
            Schedule.MissedTriggerPolicy.IGNORE
        );
        
        runner.updateSchedule(schedulePaused);
        assertThat(statusRef.get()).isEqualTo(DownloadQueue.Status.PAUSED);
    }
}

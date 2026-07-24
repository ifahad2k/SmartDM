package io.smartdm.persistence;

import io.smartdm.domain.Schedule;
import io.smartdm.domain.repository.ScheduleRepository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class SqlCipherScheduleRepository implements ScheduleRepository {

    private final SqlCipherDatabase dbManager;

    public SqlCipherScheduleRepository(SqlCipherDatabase dbManager) {
        this.dbManager = dbManager;
    }

    @Override
    public void save(Schedule schedule) {
        String sql = "INSERT INTO schedule (id, name, start_time_iso, end_time_iso, days_of_week, active, missed_trigger_policy, last_run_time, timezone_id) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET " +
                     "name=excluded.name, start_time_iso=excluded.start_time_iso, end_time_iso=excluded.end_time_iso, " +
                     "days_of_week=excluded.days_of_week, active=excluded.active, " +
                     "missed_trigger_policy=excluded.missed_trigger_policy, last_run_time=excluded.last_run_time, timezone_id=excluded.timezone_id";

        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, schedule.getId());
            stmt.setString(2, schedule.getName());
            stmt.setString(3, schedule.getStartTime().map(t -> t.format(DateTimeFormatter.ISO_LOCAL_TIME)).orElse(null));
            stmt.setString(4, schedule.getEndTime().map(t -> t.format(DateTimeFormatter.ISO_LOCAL_TIME)).orElse(null));
            stmt.setString(5, schedule.getDaysOfWeekAsString());
            stmt.setInt(6, schedule.isActive() ? 1 : 0);
            stmt.setString(7, schedule.getMissedTriggerPolicy().name());
            stmt.setLong(8, schedule.getLastRunTime());
            stmt.setString(9, schedule.getTimezoneId());
            
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save schedule", e);
        }
    }

    @Override
    public Optional<Schedule> findById(String id) {
        String sql = "SELECT * FROM schedule WHERE id = ?";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRow(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find schedule by id", e);
        }
        return Optional.empty();
    }

    @Override
    public List<Schedule> findAll() {
        List<Schedule> schedules = new ArrayList<>();
        String sql = "SELECT * FROM schedule";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
             
            while (rs.next()) {
                schedules.add(mapRow(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find all schedules", e);
        }
        return schedules;
    }

    @Override
    public void delete(String id) {
        String sql = "DELETE FROM schedule WHERE id = ?";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, id);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to delete schedule", e);
        }
    }
    
    private Schedule mapRow(ResultSet rs) throws SQLException {
        String startTimeStr = rs.getString("start_time_iso");
        LocalTime startTime = startTimeStr != null ? LocalTime.parse(startTimeStr, DateTimeFormatter.ISO_LOCAL_TIME) : null;
        
        String endTimeStr = rs.getString("end_time_iso");
        LocalTime endTime = endTimeStr != null ? LocalTime.parse(endTimeStr, DateTimeFormatter.ISO_LOCAL_TIME) : null;
        
        String timezoneId = null;
        try { timezoneId = rs.getString("timezone_id"); } catch (SQLException e) { /* migration backward compatibility */ }
        
        Schedule schedule = new Schedule(
            rs.getString("id"),
            rs.getString("name"),
            startTime,
            endTime,
            Schedule.parseDaysOfWeek(rs.getString("days_of_week")),
            rs.getInt("active") == 1,
            Schedule.MissedTriggerPolicy.valueOf(rs.getString("missed_trigger_policy")),
            timezoneId
        );
        schedule.setLastRunTime(rs.getLong("last_run_time"));
        return schedule;
    }

    @Override
    public void saveExecution(io.smartdm.domain.ScheduleExecution execution) {
        String sql = "INSERT INTO schedule_execution (id, schedule_id, execution_time_millis, status) " +
                     "VALUES (?, ?, ?, ?) " +
                     "ON CONFLICT(id) DO UPDATE SET " +
                     "status=excluded.status, execution_time_millis=excluded.execution_time_millis";

        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, execution.getId());
            stmt.setString(2, execution.getScheduleId());
            stmt.setLong(3, execution.getExecutionTimeMillis());
            stmt.setString(4, execution.getStatus().name());
            
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save schedule execution", e);
        }
    }

    @Override
    public boolean saveExecutionClaim(io.smartdm.domain.ScheduleExecution execution) {
        String sql = "INSERT INTO schedule_execution (id, schedule_id, execution_time_millis, status) " +
                     "VALUES (?, ?, ?, ?) " +
                     "ON CONFLICT(schedule_id, execution_time_millis) DO NOTHING";

        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, execution.getId());
            stmt.setString(2, execution.getScheduleId());
            stmt.setLong(3, execution.getExecutionTimeMillis());
            stmt.setString(4, execution.getStatus().name());
            
            return stmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save schedule execution claim", e);
        }
    }

    @Override
    public List<io.smartdm.domain.ScheduleExecution> findExecutionsByScheduleId(String scheduleId) {
        List<io.smartdm.domain.ScheduleExecution> executions = new ArrayList<>();
        String sql = "SELECT * FROM schedule_execution WHERE schedule_id = ? ORDER BY execution_time_millis DESC";
        try (Connection conn = dbManager.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
             
            stmt.setString(1, scheduleId);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    executions.add(new io.smartdm.domain.ScheduleExecution(
                        rs.getString("id"),
                        rs.getString("schedule_id"),
                        rs.getLong("execution_time_millis"),
                        io.smartdm.domain.ScheduleExecution.Status.valueOf(rs.getString("status"))
                    ));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to find schedule executions", e);
        }
        return executions;
    }
}

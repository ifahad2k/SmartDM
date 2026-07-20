package io.smartdm.domain.repository;

import io.smartdm.domain.Schedule;

import java.util.List;
import java.util.Optional;

public interface ScheduleRepository {
    void save(Schedule schedule);
    Optional<Schedule> findById(String id);
    List<Schedule> findAll();
    void delete(String id);
}

package io.smartdm.domain.repository;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;

import java.util.Optional;
import java.util.List;

public interface DownloadRepository {
    void save(Download download);
    Optional<Download> findById(DownloadId id);
    List<Download> findAll();
    List<Download> findReadyScheduledDownloads(long currentTimeMillis);
    void delete(DownloadId id);
}

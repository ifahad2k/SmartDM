package io.smartdm.media.api.job;

import io.smartdm.domain.DownloadId;

import java.util.Optional;

public interface MediaJobStore {

    boolean exists(DownloadId downloadId);

    Optional<MediaJobDescriptor> find(DownloadId downloadId);

    void save(MediaJobDescriptor descriptor);

    void delete(DownloadId downloadId);
}

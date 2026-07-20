package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;

public interface DownloadActionListener {
    void onPause(Download download);
    void onResume(Download download);
    void onCancel(io.smartdm.domain.Download download);
    void onDelete(io.smartdm.domain.Download download, boolean forcePermanent);
    void onAddToQueue(io.smartdm.domain.Download download);
    void onSchedule(io.smartdm.domain.Download download);
}

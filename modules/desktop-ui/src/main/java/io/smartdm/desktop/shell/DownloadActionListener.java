package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;

public interface DownloadActionListener {
    void onPause(Download download);
    void onResume(Download download);
    void onCancel(Download download);
    void onDelete(Download download, boolean permanent);
}

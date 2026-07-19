package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;

public interface DownloadProvider {
    Download getDownload(DownloadId id);
}

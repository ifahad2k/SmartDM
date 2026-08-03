package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
import javafx.beans.value.ObservableValue;

public interface DownloadProvider {
    Download getDownload(DownloadId id);
    ObservableValue<Download> getLatestUpdate();
}

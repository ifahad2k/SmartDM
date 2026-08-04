package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.SourceUri;
import javafx.application.Platform;
import javafx.stage.Stage;

import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public final class ExpiredLinkRefreshService {

    private ExpiredLinkRefreshService() {}

    public static void promptAndRefreshLink(Stage owner, Download download, Consumer<Download> onRefreshed) {
        EnterUrlDialog dialog = new EnterUrlDialog(owner, null, d -> {
            String newUrlStr = d.source().value().toString();
            CompletableFuture.runAsync(() -> {
                try {
                    // Check if new URL is valid and reachable
                    URL u = URI.create(newUrlStr).toURL();
                    HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("HEAD");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    int code = conn.getResponseCode();

                    if (code >= 200 && code < 400) {
                        // Create updated download object preserving destination and partial progress
                        Download updated = Download.create(
                                SourceUri.of(newUrlStr),
                                download.destination()
                        );
                        Platform.runLater(() -> {
                            if (onRefreshed != null) onRefreshed.accept(updated);
                        });
                    }
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            });
        });
        dialog.setTitle("SmartDM — Refresh Expired Download Link");
        dialog.setUrl(download.source().value().toString());
        dialog.show();
    }
}

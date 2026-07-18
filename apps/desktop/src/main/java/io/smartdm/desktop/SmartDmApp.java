package io.smartdm.desktop;

import javafx.application.Application;
import javafx.scene.Scene;
import javafx.stage.Stage;
import io.smartdm.desktop.shell.DownloadsWorkspace;
import io.smartdm.desktop.shell.MainShell;
import io.smartdm.desktop.shell.DownloadActionListener;
import io.smartdm.desktop.theme.ThemeManager;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.download.engine.SingleDownloadCoordinator;
import io.smartdm.download.http.HttpProbeClient;
import io.smartdm.platform.PlatformDirectories;
import io.smartdm.platform.windows.WindowsPlatformDirectories;
import io.smartdm.platform.linux.LinuxPlatformDirectories;
import io.smartdm.securestorage.KeyManager;
import io.smartdm.securestorage.windows.DpapiMasterKeyStorage;
import io.smartdm.securestorage.linux.SecretServiceMasterKeyStorage;
import io.smartdm.persistence.SqlCipherDatabase;
import io.smartdm.persistence.SqlCipherDownloadRepository;

import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import javafx.application.Platform;

public class SmartDmApp extends Application {

    private ExecutorService enginePool;

    @Override
    public void start(Stage primaryStage) {
        primaryStage.initStyle(javafx.stage.StageStyle.TRANSPARENT);

        // ── 1. Platform Directories & Key Management ────────────────────
        PlatformDirectories directories;
        KeyManager keyManager;
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            directories = new WindowsPlatformDirectories();
            keyManager = new DpapiMasterKeyStorage();
        } else {
            directories = new LinuxPlatformDirectories();
            keyManager = new SecretServiceMasterKeyStorage();
        }

        byte[] key;
        Optional<byte[]> retrieved = keyManager.retrieveMasterKey();
        if (retrieved.isPresent()) {
            key = retrieved.get();
        } else {
            key = new byte[32];
            new SecureRandom().nextBytes(key);
            try {
                keyManager.storeMasterKey(key);
            } catch (Exception e) {
                System.err.println("Warning: Failed to save database master key securely. Settings will not persist across launches.");
            }
        }

        // ── 2. Initialize Database & Repository ────────────────────────
        Path dbDir = directories.getAppDataDirectory();
        try {
            Files.createDirectories(dbDir);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create app data directory: " + dbDir, e);
        }
        Path dbFile = dbDir.resolve("smartdm.db");

        SqlCipherDatabase database = new SqlCipherDatabase(dbFile, key);
        database.migrate();

        DownloadRepository repository = new SqlCipherDownloadRepository(database);

        // ── 3. Initialize Thread Pool & HTTP Clients ────────────────────
        enginePool = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "smartdm-engine");
            t.setDaemon(true);
            return t;
        });

        HttpClient httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        HttpProbeClient probeClient = new HttpProbeClient(httpClient);

        final DownloadsWorkspace[] workspaceRef = new DownloadsWorkspace[1];

        // ── 5. Event Publisher & Coordinator ────────────────────────────
        DownloadEvent.Publisher publisher = event -> {
            if (workspaceRef[0] != null) {
                Platform.runLater(workspaceRef[0]::refresh);
            }
        };

        SingleDownloadCoordinator coordinator = new SingleDownloadCoordinator(
                repository, probeClient, httpClient, publisher,
                directories.getCacheDirectory().resolve("temp")
        );

        DownloadsWorkspace workspace = new DownloadsWorkspace(new DownloadActionListener() {
            @Override
            public void onPause(Download download) {
                coordinator.pause(download.id());
                download.updateState(DownloadState.PAUSED);
                if (workspaceRef[0] != null) {
                    workspaceRef[0].refresh();
                }
            }

            @Override
            public void onResume(Download download) {
                download.updateState(DownloadState.QUEUED);
                repository.save(download);
                if (workspaceRef[0] != null) {
                    workspaceRef[0].refresh();
                }
                enginePool.submit(() -> coordinator.execute(download));
            }

            @Override
            public void onCancel(Download download) {
                coordinator.cancel(download.id());
                download.updateState(DownloadState.CANCELED);
                if (workspaceRef[0] != null) {
                    workspaceRef[0].refresh();
                }
            }

            @Override
            public void onDelete(Download download, boolean permanent) {
                if (download.state() == DownloadState.DOWNLOADING || download.state() == DownloadState.PROBING) {
                    coordinator.cancel(download.id());
                }
                repository.delete(download.id());
                if (permanent) {
                    enginePool.submit(() -> {
                        try {
                            Files.deleteIfExists(download.destination().value());
                        } catch (Exception ignored) {}
                        try {
                            Path partFile = directories.getCacheDirectory().resolve("temp")
                                    .resolve(download.id().value() + ".part");
                            Files.deleteIfExists(partFile);
                        } catch (Exception ignored) {}
                    });
                }
            }
        });
        workspaceRef[0] = workspace;

        // ── 4. Populate Workspace from database at startup ─────────────
        try {
            for (Download dl : repository.findAll()) {
                workspace.addDownload(dl);
            }
        } catch (Exception e) {
            System.err.println("Warning: Failed to load downloads from database: " + e.getMessage());
        }

        // ── 6. UI Wire Up ────────────────────────────────────────────────
        MainShell shell = new MainShell(primaryStage, download -> {
            enginePool.submit(() -> coordinator.execute(download));
        }, workspace);

        Scene scene = new Scene(shell, 1180, 760);
        scene.setFill(javafx.scene.paint.Color.TRANSPARENT);

        ThemeManager themeManager = new ThemeManager();
        themeManager.applyTheme(scene);
        scene.getStylesheets().add(getClass().getResource("/io/smartdm/desktop/theme/dialog.css").toExternalForm());
        scene.getStylesheets().add(getClass().getResource("/io/smartdm/desktop/theme/main.css").toExternalForm());

        primaryStage.setTitle("SmartDM");
        primaryStage.setScene(scene);
        primaryStage.setMinWidth(800);
        primaryStage.setMinHeight(600);
        primaryStage.show();
    }

    @Override
    public void stop() {
        if (enginePool != null) {
            enginePool.shutdownNow();
            try {
                enginePool.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    public static void main(String[] args) {
        launch(args);
    }
}

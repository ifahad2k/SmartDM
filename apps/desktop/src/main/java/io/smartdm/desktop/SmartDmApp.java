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
import io.smartdm.download.engine.queue.QueueCoordinator;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
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
import io.smartdm.application.ProfileLock;

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
    private ProfileLock profileLock;
    private SingleDownloadCoordinator coordinator;
    private io.smartdm.download.engine.schedule.ScheduleRunner scheduleRunner;
    private io.smartdm.application.monitor.ResourceMonitor resourceMonitor;

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

        profileLock = new ProfileLock(directories);
        if (!profileLock.tryAcquire()) {
            System.err.println("Another instance of SmartDM is already running.");
            Platform.exit();
            return;
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
        AtomicReference<QueueCoordinator> queueCoordinatorRef = new AtomicReference<>();
        AtomicBoolean updatePending = new AtomicBoolean(false);
        DownloadEvent.Publisher publisher = event -> {
            if (event instanceof DownloadEvent.StateChanged) {
                DownloadState state = event.download().state();
                if (state == DownloadState.COMPLETED || state == DownloadState.FAILED || state == DownloadState.CANCELED) {
                    if (queueCoordinatorRef.get() != null) {
                        queueCoordinatorRef.get().markDownloadFinished(event.downloadId());
                    }
                }
            }
            if (workspaceRef[0] != null) {
                Download updated = event.download();
                if (updated != null) {
                    Platform.runLater(() -> {
                        workspaceRef[0].updateDownload(updated);
                        if (updatePending.compareAndSet(false, true)) {
                            updatePending.set(false);
                            workspaceRef[0].refresh();
                        }
                    });
                }
            }
        };

        io.smartdm.download.engine.limit.TokenBucketRateLimiter globalLimiter = 
            new io.smartdm.download.engine.limit.TokenBucketRateLimiter(null, null);

        coordinator = new SingleDownloadCoordinator(
                repository, probeClient, httpClient, publisher,
                directories.getCacheDirectory().resolve("temp"),
                globalLimiter
        );

        // Phase 6 Engine wiring
        io.smartdm.download.engine.queue.QueueCoordinator.DownloadStarter starter = new io.smartdm.download.engine.queue.QueueCoordinator.DownloadStarter() {
                @Override public void startDownload(io.smartdm.domain.DownloadId id) {
                    repository.findById(id).ifPresent(d -> {
                        d.updateState(io.smartdm.domain.DownloadState.PROBING);
                        enginePool.submit(() -> coordinator.execute(d));
                    });
                }
                @Override public void pauseDownload(io.smartdm.domain.DownloadId id) {
                    coordinator.pause(id);
                }
                @Override public boolean isActive(io.smartdm.domain.DownloadId id) {
                    return repository.findById(id).map(d -> 
                        d.state() == io.smartdm.domain.DownloadState.DOWNLOADING || d.state() == io.smartdm.domain.DownloadState.PROBING)
                        .orElse(false);
                }
                @Override public boolean isScheduledFuture(io.smartdm.domain.DownloadId id) {
                    return repository.findById(id).map(d -> {
                        if (d.scheduledStartTime() != null) {
                            return System.currentTimeMillis() < d.scheduledStartTime();
                        }
                        return false;
                    }).orElse(false);
                }
            };
        
        io.smartdm.download.engine.queue.QueueCoordinator queueCoordinator = new io.smartdm.download.engine.queue.QueueCoordinator(starter);
        queueCoordinatorRef.set(queueCoordinator);

        // Setup a Default Main Queue (Concurrency 2)
        io.smartdm.domain.DownloadQueue[] currentQueueRef = { new io.smartdm.domain.DownloadQueue("main-queue", "Main Queue", 2, null, io.smartdm.domain.DownloadQueue.Status.ACTIVE) };
        queueCoordinator.updateQueue(currentQueueRef[0]);
        javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems = javafx.collections.FXCollections.observableArrayList();

        scheduleRunner = 
            new io.smartdm.download.engine.schedule.ScheduleRunner(java.time.Clock.systemDefaultZone(), status -> {
                if (currentQueueRef[0].getStatus() != status) {
                    currentQueueRef[0] = currentQueueRef[0].withStatus(status);
                    if (queueCoordinatorRef.get() != null) {
                        queueCoordinatorRef.get().updateQueue(currentQueueRef[0]);
                    }
                    javafx.application.Platform.runLater(() -> {
                        if (workspaceRef[0] != null) workspaceRef[0].refresh();
                    });
                }
            }, () -> {
                try {
                    long now = System.currentTimeMillis();
                    java.util.List<Download> ready = repository.findReadyScheduledDownloads(now);
                    if (!ready.isEmpty()) {
                        for (Download d : ready) {
                            d.updateScheduledStartTime(null);
                            repository.save(d);
                            publisher.publish(new io.smartdm.domain.DownloadEvent.StateChanged(d.id(), d.state(), d));
                        }
                        if (queueCoordinatorRef.get() != null) {
                            queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                        }
                    }
                } catch (Exception e) {
                    System.err.println("Error checking scheduled downloads: " + e.getMessage());
                }
            });
        scheduleRunner.start();

        resourceMonitor = 
            new io.smartdm.application.monitor.ResourceMonitor(underPressure -> {
                if (underPressure) {
                    System.out.println("Warning: Low disk space! Throttling or pausing downloads.");
                    globalLimiter.setLimit(50L * 1024); // Throttle to 50KB/s when space is extremely low
                } else {
                    globalLimiter.setLimit(null);
                }
            }, () -> {
                if (workspaceRef[0] != null) {
                    return workspaceRef[0].getDownloadsList();
                }
                return java.util.Collections.emptyList();
            }, directories.getCacheDirectory().resolve("temp"));
        resourceMonitor.start();

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
                boolean exists = mainQueueItems.stream().anyMatch(item -> item.getDownloadId().equals(download.id()));
                if (!exists) {
                    mainQueueItems.add(new io.smartdm.domain.QueueItem(java.util.UUID.randomUUID().toString(), "main-queue", download.id(), 1, mainQueueItems.size()));
                    queueCoordinator.updateQueueItems("main-queue", mainQueueItems);
                }
            }

            @Override
            public void onCancel(Download download) {
                coordinator.cancel(download.id()).thenRun(() -> {
                    download.updateState(DownloadState.CANCELED);
                    Platform.runLater(() -> {
                        if (workspaceRef[0] != null) {
                            workspaceRef[0].refresh();
                        }
                    });
                });
            }

            @Override
            public void onDelete(Download download, boolean permanent) {
                Runnable deleteAction = () -> {
                    repository.delete(download.id());
                    
                    Platform.runLater(() -> {
                        mainQueueItems.removeIf(item -> item.getDownloadId().equals(download.id()));
                        queueCoordinator.updateQueueItems("main-queue", mainQueueItems);
                    });
                    
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
                };

                if (download.state() == DownloadState.DOWNLOADING || download.state() == DownloadState.PROBING) {
                    coordinator.cancel(download.id()).thenRun(deleteAction);
                } else {
                    deleteAction.run();
                }
            }
        });
        workspaceRef[0] = workspace;

        // ── 4. Populate Workspace from database at startup ─────────────
        try {
            for (Download dl : repository.findAll()) {
                workspace.addDownload(dl);
                if (dl.state() == io.smartdm.domain.DownloadState.QUEUED) {
                    io.smartdm.domain.QueueItem item = new io.smartdm.domain.QueueItem(java.util.UUID.randomUUID().toString(), "main-queue", dl.id(), 1, mainQueueItems.size());
                    mainQueueItems.add(item);
                }
            }
            queueCoordinator.updateQueueItems("main-queue", mainQueueItems);
        } catch (Exception e) {
            System.err.println("Warning: Failed to load downloads from database: " + e.getMessage());
        }

        // ── 6. UI Wire Up ────────────────────────────────────────────────
        io.smartdm.desktop.shell.SchedulerWorkspace.ScheduleManager scheduleManager = new io.smartdm.desktop.shell.SchedulerWorkspace.ScheduleManager() {
            @Override
            public java.util.Collection<io.smartdm.domain.Schedule> getSchedules() {
                return scheduleRunner.getSchedules();
            }
            @Override
            public void updateSchedule(io.smartdm.domain.Schedule schedule) {
                scheduleRunner.updateSchedule(schedule);
            }
            @Override
            public void removeSchedule(String id) {
                scheduleRunner.removeSchedule(id);
            }
        };

        MainShell shell = new MainShell(primaryStage, download -> {
            repository.save(download);
            if (download.state() == io.smartdm.domain.DownloadState.QUEUED) {
                // Add to Queue instead of starting immediately
                io.smartdm.domain.QueueItem item = new io.smartdm.domain.QueueItem(java.util.UUID.randomUUID().toString(), "main-queue", download.id(), 1, mainQueueItems.size());
                mainQueueItems.add(item);
                queueCoordinator.updateQueueItems("main-queue", mainQueueItems);
                System.out.println("Added download to Main Queue. Current queue size: " + mainQueueItems.size());
            } else {
                enginePool.submit(() -> coordinator.execute(download));
            }
        }, workspace, currentQueueRef[0], mainQueueItems, scheduleManager, status -> {
            if (currentQueueRef[0].getStatus() != status) {
                currentQueueRef[0] = currentQueueRef[0].withStatus(status);
                if (queueCoordinatorRef.get() != null) {
                    queueCoordinatorRef.get().updateQueue(currentQueueRef[0]);
                }
                javafx.application.Platform.runLater(() -> {
                    if (workspaceRef[0] != null) workspaceRef[0].refresh();
                });
            }
        });

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
        if (scheduleRunner != null) {
            scheduleRunner.stop();
        }
        if (resourceMonitor != null) {
            resourceMonitor.stop();
        }
        if (coordinator != null) {
            coordinator.shutdown();
        }
        if (enginePool != null) {
            enginePool.shutdownNow();
            try {
                enginePool.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
        if (profileLock != null) {
            profileLock.close();
        }
    }

    public static void main(String[] args) {
        launch(args);
    }
}

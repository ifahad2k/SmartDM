package io.smartdm.desktop;

import javafx.application.Application;
import javafx.scene.Scene;
import javafx.stage.Stage;
import io.smartdm.desktop.shell.DownloadsWorkspace;
import io.smartdm.desktop.shell.MainShell;
import io.smartdm.desktop.shell.DownloadActionListener;
import io.smartdm.desktop.shell.AuthDialog;
import io.smartdm.desktop.theme.ThemeManager;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.desktop.shell.AuthDialog;
import io.smartdm.download.engine.queue.QueueCoordinator;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import io.smartdm.download.engine.SingleDownloadCoordinator;
import io.smartdm.download.http.HttpProbeClient;
import io.smartdm.download.http.SmartDmProxySelector;
import io.smartdm.platform.PlatformDirectories;
import io.smartdm.platform.windows.WindowsPlatformDirectories;
import io.smartdm.platform.linux.LinuxPlatformDirectories;
import io.smartdm.securestorage.KeyManager;
import io.smartdm.securestorage.windows.DpapiMasterKeyStorage;
import io.smartdm.securestorage.linux.SecretServiceMasterKeyStorage;
import io.smartdm.persistence.SqlCipherDatabase;
import io.smartdm.persistence.SqlCipherDownloadRepository;
import io.smartdm.persistence.SqlCipherCategoryRepository;
import io.smartdm.domain.repository.CategoryRepository;
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
        CategoryRepository categoryRepository = new SqlCipherCategoryRepository(database);
        io.smartdm.domain.repository.ScheduleRepository scheduleRepo = new io.smartdm.persistence.SqlCipherScheduleRepository(database);

        // ── 3. Initialize Thread Pool & HTTP Clients ────────────────────
        enginePool = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "smartdm-engine");
            t.setDaemon(true);
            return t;
        });

        SmartDmProxySelector proxySelector = new SmartDmProxySelector();
        // proxySelector.setConfig(ProxyConfig.system()); // System by default

        HttpClient httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .proxy(proxySelector)
                .build();
        HttpProbeClient probeClient = new HttpProbeClient(httpClient);

        final DownloadsWorkspace[] workspaceRef = new DownloadsWorkspace[1];
        AtomicReference<io.smartdm.desktop.shell.QueueWorkspace> queueWorkspaceRef = new AtomicReference<>();
        AtomicReference<io.smartdm.desktop.shell.SchedulerWorkspace> schedulerWorkspaceRef = new AtomicReference<>();
        javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems = javafx.collections.FXCollections.observableArrayList();

        // ── 5. Event Publisher & Coordinator ────────────────────────────
        AtomicReference<QueueCoordinator> queueCoordinatorRef = new AtomicReference<>();
        AtomicReference<io.smartdm.download.engine.queue.QueueCoordinator.DownloadStarter> starterRef = new AtomicReference<>();
        AtomicBoolean updatePending = new AtomicBoolean(false);
        DownloadEvent.Publisher publisher = event -> {
            if (event instanceof DownloadEvent.StateChanged) {
                DownloadState state = event.download().state();
                if (state == DownloadState.COMPLETED || state == DownloadState.FAILED || state == DownloadState.CANCELED) {
                    if (queueCoordinatorRef.get() != null) {
                        queueCoordinatorRef.get().markDownloadFinished(event.downloadId());
                    }
                    Platform.runLater(() -> {
                        if (state == DownloadState.COMPLETED) {
                            mainQueueItems.removeIf(item -> item.getDownloadId().equals(event.downloadId()));
                            if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                        }
                    });
                } else if (state == DownloadState.REQUIRES_AUTH) {
                    Platform.runLater(() -> {
                        String host = event.download().source().value().getHost();
                        AuthDialog authDialog = new AuthDialog(primaryStage, host, "Secure Area");
                        authDialog.showAndWait();
                        if (authDialog.getCredential() != null) {
                            event.download().updateCredential(authDialog.getCredential());
                            event.download().updateState(DownloadState.QUEUED);
                            repository.save(event.download());
                            if (starterRef.get() != null) {
                                starterRef.get().startDownload(event.downloadId());
                            }
                        } else {
                            event.download().updateState(DownloadState.PAUSED);
                            repository.save(event.download());
                            if (workspaceRef[0] != null) workspaceRef[0].updateDownload(event.download());
                        }
                    });
                }
            }
            if (workspaceRef[0] != null) {
                Download updated = event.download();
                if (updated != null) {
                    boolean stateChanged = event instanceof DownloadEvent.StateChanged;
                    
                    if (stateChanged || updatePending.compareAndSet(false, true)) {
                        Platform.runLater(() -> {
                            if (!stateChanged) {
                                updatePending.set(false);
                            }
                            
                            workspaceRef[0].updateDownload(updated);
                            
                            if (stateChanged) {
                                if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                                if (schedulerWorkspaceRef.get() != null) schedulerWorkspaceRef.get().refreshList();
                            }
                        });
                    }
                }
            }
        };

        io.smartdm.download.engine.limit.TokenBucketRateLimiter globalLimiter = 
            new io.smartdm.download.engine.limit.TokenBucketRateLimiter(null, null);

        coordinator = new SingleDownloadCoordinator(
                repository, categoryRepository, probeClient, httpClient, publisher,
                directories.getCacheDirectory().resolve("temp"),
                globalLimiter
        );

        // Phase 6 Engine wiring
        io.smartdm.download.engine.queue.QueueCoordinator.DownloadStarter starter = new io.smartdm.download.engine.queue.QueueCoordinator.DownloadStarter() {
                @Override public void startDownload(io.smartdm.domain.DownloadId id) {
                    repository.findById(id).ifPresent(d -> {
                        d.updateState(io.smartdm.domain.DownloadState.PROBING);
                        
                        javafx.application.Platform.runLater(() -> {
                            boolean removed = mainQueueItems.removeIf(item -> item.getDownloadId().equals(d.id()));
                            if (removed) {
                                if (queueCoordinatorRef.get() != null) {
                                    queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                                }
                                if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                            }
                        });

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
        starterRef.set(starter);

        // Setup a Default Main Queue (Concurrency 4), default to PAUSED so items can be scheduled or queued
        io.smartdm.domain.DownloadQueue[] currentQueueRef = { new io.smartdm.domain.DownloadQueue("main-queue", "Main Queue", 4, null, io.smartdm.domain.DownloadQueue.Status.PAUSED) };
        queueCoordinator.updateQueue(currentQueueRef[0]);

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
                            
                            if (starterRef.get() != null) {
                                starterRef.get().startDownload(d.id());
                            }
                            
                            if (schedulerWorkspaceRef.get() != null) {
                                javafx.application.Platform.runLater(() -> schedulerWorkspaceRef.get().refreshList());
                            }
                        }
                    }
                } catch (Exception e) {
                    System.err.println("Error checking scheduled downloads: " + e.getMessage());
                }
            }, scheduleRepo::save);
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
                if (download.state() == DownloadState.QUEUED) {
                    download.updateScheduledStartTime(null);
                    download.updateState(DownloadState.PAUSED);
                    scheduleRepo.delete(download.id().value());
                    repository.save(download);
                    
                    boolean removed = mainQueueItems.removeIf(item -> item.getDownloadId().equals(download.id()));
                    if (removed) {
                        if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                    }
                    
                    if (workspaceRef[0] != null) workspaceRef[0].updateDownload(download);
                } else {
                    coordinator.pause(download.id());
                    download.updateState(DownloadState.PAUSED);
                }
                if (workspaceRef[0] != null) workspaceRef[0].refresh();
                if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
            }

            @Override
            public void onResume(Download download) {
                if (download.state() == DownloadState.PAUSED || download.state() == DownloadState.QUEUED || download.state() == DownloadState.FAILED || download.state() == DownloadState.CANCELED) {
                    boolean removed = mainQueueItems.removeIf(item -> item.getDownloadId().equals(download.id()));
                    if (removed) {
                        if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                    }
                    
                    download.updateState(DownloadState.PROBING);
                    repository.save(download);
                    if (workspaceRef[0] != null) {
                        workspaceRef[0].refresh();
                    }
                    if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                    
                    enginePool.submit(() -> coordinator.execute(download));
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
                // Always try to cancel the engine session first, regardless of state
                coordinator.cancel(download.id()).whenComplete((v, ex) -> {
                    scheduleRepo.delete(download.id().value());
                    repository.delete(download.id());
                    
                    Platform.runLater(() -> {
                        mainQueueItems.removeIf(item -> item.getDownloadId().equals(download.id()));
                        queueCoordinator.updateQueueItems("main-queue", mainQueueItems);
                        if (workspaceRef[0] != null) workspaceRef[0].removeDownload(download.id());
                        if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
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
                });
            }

            @Override
            public void onAddToQueue(Download download) {
                if (download.state() == DownloadState.COMPLETED) return;
                
                // Transition the download state gracefully to QUEUED
                coordinator.queue(download.id());
                
                boolean exists = mainQueueItems.stream().anyMatch(item -> item.getDownloadId().equals(download.id()));
                if (!exists) {
                    mainQueueItems.add(new io.smartdm.domain.QueueItem(java.util.UUID.randomUUID().toString(), "main-queue", download.id(), 1, mainQueueItems.size()));
                    if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                }
                
                if (workspaceRef[0] != null) workspaceRef[0].refresh();
                if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
            }

            @Override
            public void onSchedule(Download download) {
                repository.save(download);
                if (download.scheduledStartTime() != null) {
                    coordinator.queue(download.id());
                }
                if (workspaceRef[0] != null) workspaceRef[0].refresh();
                if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                if (schedulerWorkspaceRef.get() != null) schedulerWorkspaceRef.get().refreshList();
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
            
            for (io.smartdm.domain.Schedule s : scheduleRepo.findAll()) {
                scheduleRunner.updateSchedule(s);
            }
        } catch (Exception e) {
            System.err.println("Warning: Failed to load downloads from database: " + e.getMessage());
        }

        // ── 6. UI Wire Up ────────────────────────────────────────────────

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
        }, workspace, currentQueueRef[0], mainQueueItems, status -> {
            if (currentQueueRef[0].getStatus() != status) {
                currentQueueRef[0] = currentQueueRef[0].withStatus(status);
                if (queueCoordinatorRef.get() != null) {
                    queueCoordinatorRef.get().updateQueue(currentQueueRef[0]);
                }
                javafx.application.Platform.runLater(() -> {
                    if (workspaceRef[0] != null) workspaceRef[0].refresh();
                });
            }
        }, repository::findScheduledDownloads, d -> {
            repository.save(d);
            publisher.publish(new io.smartdm.domain.DownloadEvent.StateChanged(d.id(), d.state(), d));
            if (workspaceRef[0] != null) {
                javafx.application.Platform.runLater(() -> workspaceRef[0].refresh());
            }
        });
        schedulerWorkspaceRef.set(shell.getSchedulerWorkspace());
        queueWorkspaceRef.set(shell.getQueueWorkspace());

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

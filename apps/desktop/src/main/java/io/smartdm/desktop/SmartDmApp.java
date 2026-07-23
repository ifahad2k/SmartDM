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
import io.smartdm.persistence.SqlCipherCatalogRepository;
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
    private static final java.util.Map<String, io.smartdm.media.api.MediaMetadata> metadataCache = new java.util.concurrent.ConcurrentHashMap<>();
    private SingleDownloadCoordinator coordinator;
    private io.smartdm.download.engine.schedule.ScheduleRunner scheduleRunner;
    private io.smartdm.application.monitor.ResourceMonitor resourceMonitor;
    private io.smartdm.application.ipc.LocalIpcServer ipcServer;

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

        io.smartdm.desktop.shell.MediaDownloadTracker.init(repository, publisher);

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
                if (io.smartdm.desktop.shell.MediaDownloadTracker.isMediaDownload(download.id())) {
                    io.smartdm.desktop.shell.MediaDownloadTracker.pauseDownload(download);
                    if (workspaceRef[0] != null) workspaceRef[0].refresh();
                    if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                    return;
                }
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
                if (io.smartdm.desktop.shell.MediaDownloadTracker.isMediaDownload(download.id())) {
                    io.smartdm.desktop.shell.MediaDownloadTracker.resumeDownload(download);
                    if (workspaceRef[0] != null) workspaceRef[0].refresh();
                    if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                    return;
                }
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
                if (io.smartdm.desktop.shell.MediaDownloadTracker.isMediaDownload(download.id())) {
                    io.smartdm.desktop.shell.MediaDownloadTracker.cancelDownload(download);
                    if (workspaceRef[0] != null) workspaceRef[0].refresh();
                    if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                    return;
                }
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
                boolean isMedia = io.smartdm.desktop.shell.MediaDownloadTracker.isMediaDownload(download.id());
                if (isMedia) {
                    io.smartdm.desktop.shell.MediaDownloadTracker.deleteDownload(download, permanent);
                } else {
                    try {
                        coordinator.cancel(download.id(), false).get(2, java.util.concurrent.TimeUnit.SECONDS);
                    } catch (Exception ignored) {}
                }
                
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
                        io.smartdm.desktop.shell.MediaDownloadTracker.deleteMediaFiles(download.destination().value());
                        try {
                            Path partFile = directories.getCacheDirectory().resolve("temp")
                                    .resolve(download.id().value() + ".part");
                            Files.deleteIfExists(partFile);
                        } catch (Exception ignored) {}
                    });
                }
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

        // ── 5. Catalog Service Setup ─────────────────────────────────────
        SqlCipherCatalogRepository catalogRepo = new SqlCipherCatalogRepository(database);
        io.smartdm.catalog.CatalogService catalogService = new io.smartdm.catalog.CatalogService(catalogRepo);

        // ── 5b. Smart Folder Service Setup ───────────────────────────────
        io.smartdm.persistence.SqlCipherFolderAffinityRepository affinityRepo = new io.smartdm.persistence.SqlCipherFolderAffinityRepository(database);
        io.smartdm.organization.SmartFolderService smartFolderService = new io.smartdm.organization.SmartFolderService(categoryRepository, catalogRepo, affinityRepo);

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
        }, catalogService, smartFolderService);
        schedulerWorkspaceRef.set(shell.getSchedulerWorkspace());
        queueWorkspaceRef.set(shell.getQueueWorkspace());

        ipcServer = new io.smartdm.application.ipc.LocalIpcServer(message -> {
            if (message instanceof io.smartdm.browser.protocol.GetMediaFormatsRequest req) {
                try {
                    io.smartdm.media.ytdlp.LocalMediaToolManager toolMgr = new io.smartdm.media.ytdlp.LocalMediaToolManager();
                    if (toolMgr.isAvailable()) {
                        io.smartdm.media.ytdlp.YtDlpExtractor extractor = new io.smartdm.media.ytdlp.YtDlpExtractor(toolMgr);
                        io.smartdm.media.api.MediaMetadata meta = extractor.extractMetadataAsync(req.url()).get(45, java.util.concurrent.TimeUnit.SECONDS);
                        if (meta != null && meta.formats() != null && !meta.formats().isEmpty()) {
                            metadataCache.put(req.url(), meta);
                            com.fasterxml.jackson.databind.ObjectMapper jsonMapper = new com.fasterxml.jackson.databind.ObjectMapper();
                            java.util.Map<String, Object> resp = new java.util.HashMap<>();
                            resp.put("success", true);
                            resp.put("title", meta.title());
                            resp.put("formats", meta.formats());
                            return jsonMapper.writeValueAsString(resp);
                        }
                    }
                } catch (Exception ex) {
                    System.err.println("IPC format extraction error: " + ex.getMessage());
                }
                
                com.fasterxml.jackson.databind.ObjectMapper jsonMapper = new com.fasterxml.jackson.databind.ObjectMapper();
                java.util.Map<String, Object> resp = new java.util.HashMap<>();
                resp.put("success", false);
                resp.put("title", "Media Page");
                resp.put("formats", java.util.List.of());
                try { return jsonMapper.writeValueAsString(resp); } catch (Exception e) { return "{\"success\":false}"; }
            } else if (message instanceof io.smartdm.browser.protocol.StartMediaDownloadRequest req) {
                System.out.println(">>> [IPC] Received StartMediaDownloadRequest: url=" + req.url() + " videoUrl=" + req.videoUrl() + " audioUrl=" + req.audioUrl() + " formatId=" + req.formatId());
                openMediaOrStandardDialog(req.url(), req.videoUrl(), req.audioUrl(), req.formatId(), repository, workspaceRef, mainQueueItems, queueCoordinatorRef, enginePool, coordinator, smartFolderService);
                return "{\"success\":true}";
            } else if (message instanceof io.smartdm.browser.protocol.AddDownloadRequest req) {
                openMediaOrStandardDialog(req.url(), null, null, null, repository, workspaceRef, mainQueueItems, queueCoordinatorRef, enginePool, coordinator, smartFolderService);
                return "{\"status\":\"ok\",\"version\":\"1.0\"}";
            } else if (message instanceof io.smartdm.browser.protocol.AddBatchRequest req) {
                javafx.application.Platform.runLater(() -> {
                    io.smartdm.desktop.shell.BatchAddDialog d = new io.smartdm.desktop.shell.BatchAddDialog(primaryStage);
                    d.setInputText(String.join("\n", req.urls()));
                    d.showAndWait();
                    if (d.isResultConfirmed() && d.getBatchUrls() != null) {
                        for (String url : d.getBatchUrls()) {
                            try {
                                String filename = java.nio.file.Paths.get(new java.net.URI(url).getPath()).getFileName().toString();
                                if (filename == null || filename.isEmpty()) filename = "download_" + System.currentTimeMillis();
                                String defaultDir = java.nio.file.Paths.get(System.getProperty("user.home"), "Downloads").toAbsolutePath().toString();
                                io.smartdm.domain.Destination dest = io.smartdm.domain.Destination.of(java.nio.file.Paths.get(defaultDir, filename));
                                io.smartdm.domain.Download dl = io.smartdm.domain.Download.create(io.smartdm.domain.SourceUri.of(url), dest);
                                repository.save(dl);
                                if (dl.state() == io.smartdm.domain.DownloadState.QUEUED) {
                                    io.smartdm.domain.QueueItem item = new io.smartdm.domain.QueueItem(java.util.UUID.randomUUID().toString(), "main-queue", dl.id(), 1, mainQueueItems.size());
                                    mainQueueItems.add(item);
                                } else {
                                    enginePool.submit(() -> coordinator.execute(dl));
                                }
                            } catch (Exception ex) {}
                        }
                        if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                        if (d.isDownloadNowRequested()) {
                            // Run the queue
                            if (currentQueueRef[0].getStatus() != io.smartdm.domain.DownloadQueue.Status.ACTIVE) {
                                currentQueueRef[0] = currentQueueRef[0].withStatus(io.smartdm.domain.DownloadQueue.Status.ACTIVE);
                                if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueue(currentQueueRef[0]);
                                if (workspaceRef[0] != null) workspaceRef[0].refresh();
                            }
                        }
                    }
                });
            } else if (message instanceof io.smartdm.browser.protocol.AddMediaBatchRequest req) {
                javafx.application.Platform.runLater(() -> {
                    io.smartdm.desktop.shell.MediaBatchAddDialog d = new io.smartdm.desktop.shell.MediaBatchAddDialog(
                        primaryStage, 
                        req.urls(), 
                        enginePool, 
                        dl -> {
                            repository.save(dl);
                            if (workspaceRef[0] != null) workspaceRef[0].addDownload(dl);
                        }
                    );
                    d.showAndWait();
                    if (queueWorkspaceRef.get() != null) queueWorkspaceRef.get().refreshList();
                });
            }
            return "{\"status\":\"ok\",\"version\":\"1.0\"}";
        });
        try {
            ipcServer.start(enginePool);
        } catch (Exception e) {
            System.err.println("Failed to start IPC server: " + e.getMessage());
        }

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
        if (ipcServer != null) {
            ipcServer.stop();
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

    private static boolean isMediaUrlPattern(String url, String preferredFormatId) {
        if (preferredFormatId != null && !preferredFormatId.isBlank()) return true;
        if (url == null || url.isBlank()) return false;
        
        String lower = url.toLowerCase();
        
        // Check direct video/audio extensions
        if (lower.contains(".mp4") || lower.contains(".m3u8") || lower.contains(".mpd") ||
            lower.contains(".webm") || lower.contains(".m4a") || lower.contains(".mp3") ||
            lower.contains(".ts") || lower.contains(".mov") || lower.contains(".flv") ||
            lower.contains(".mkv") || lower.contains(".avi")) {
            return true;
        }

        // Check universal video route patterns
        if (lower.contains("/video") || lower.contains("/watch") || lower.contains("/reel") ||
            lower.contains("/shorts") || lower.contains("/v/") || lower.contains("/clip") ||
            lower.contains("/play") || lower.contains("viewkey=")) {
            return true;
        }

        return false;
    }

    private static String deriveTitleFromUrl(String url) {
        if (url == null || url.isBlank()) return "Media Video";
        try {
            java.net.URI uri = new java.net.URI(url);
            String host = uri.getHost();
            if (host != null) {
                host = host.toLowerCase().replace("www.", "");
                if (host.contains("facebook.com") || host.contains("fbcdn.net")) return "Facebook Video";
                if (host.contains("instagram.com") || host.contains("cdninstagram.com")) return "Instagram Video";
                if (host.contains("tiktok.com") || host.contains("ttwstatic.com")) return "TikTok Video";
                if (host.contains("twitter.com") || host.contains("x.com") || host.contains("twimg.com")) return "Twitter Video";
                if (host.contains("dailymotion.com") || host.contains("dmcdn.net")) return "Dailymotion Video";
                if (host.contains("vimeo.com") || host.contains("vimeocdn.com")) return "Vimeo Video";
                if (host.contains("youtube.com") || host.contains("googlevideo.com")) return "YouTube Video";
            }
            String path = uri.getPath();
            if (path != null && path.contains("/")) {
                String seg = path.substring(path.lastIndexOf('/') + 1);
                if (seg.contains(".")) {
                    seg = seg.substring(0, seg.lastIndexOf('.'));
                }
                seg = seg.replace('-', ' ').replace('_', ' ').trim();
                if (!seg.isBlank() && seg.length() < 30 && seg.contains(" ") && !seg.endsWith(".php")) {
                    String[] words = seg.split("\\s+");
                    StringBuilder sb = new StringBuilder();
                    for (String w : words) {
                        if (!w.isEmpty()) {
                            sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1)).append(" ");
                        }
                    }
                    return sb.toString().trim();
                }
            }
            if (host != null) {
                return host + " Video";
            }
        } catch (Exception ignored) {}
        return "Media Video";
    }

    private static void openMediaOrStandardDialog(
        String url,
        String videoUrl,
        String audioUrl,
        String preferredFormatId,
        DownloadRepository repository,
        DownloadsWorkspace[] workspaceRef,
        java.util.List<io.smartdm.domain.QueueItem> mainQueueItems,
        AtomicReference<QueueCoordinator> queueCoordinatorRef,
        ExecutorService enginePool,
        SingleDownloadCoordinator coordinator,
        io.smartdm.organization.SmartFolderService smartFolderService
    ) {
        boolean isMediaUrl = isMediaUrlPattern(url, preferredFormatId) || (videoUrl != null && !videoUrl.isBlank());

        io.smartdm.media.ytdlp.LocalMediaToolManager toolMgr = new io.smartdm.media.ytdlp.LocalMediaToolManager();
        if (isMediaUrl) {
            String targetStreamUrl = (videoUrl != null && !videoUrl.isBlank()) ? videoUrl : url;
            enginePool.submit(() -> {
                io.smartdm.media.api.MediaMetadata meta = metadataCache.get(url);
                String extractionError = null;
                
                // Only invoke yt-dlp metadata dump if direct stream URL was not provided and not in cache
                if (meta == null && (videoUrl == null || videoUrl.isBlank()) && toolMgr.isAvailable()) {
                    try {
                        io.smartdm.media.ytdlp.YtDlpExtractor extractor = new io.smartdm.media.ytdlp.YtDlpExtractor(toolMgr);
                        meta = extractor.extractMetadataAsync(url).get(20, java.util.concurrent.TimeUnit.SECONDS);
                        if (meta != null) metadataCache.put(url, meta);
                    } catch (Exception ex) {
                        System.err.println("Media metadata extraction failed: " + ex.getMessage());
                        extractionError = ex.getMessage();
                    }
                }

                if (meta == null && url != null && (url.contains("youtube.com") || url.contains("youtu.be"))) {
                    final String err = extractionError;
                    javafx.application.Platform.runLater(() -> {
                        javafx.scene.control.Alert alert = new javafx.scene.control.Alert(javafx.scene.control.Alert.AlertType.ERROR);
                        alert.setTitle("YouTube Extraction Failed");
                        alert.setHeaderText("YouTube Bot Protection / Rate Limit");
                        if (err != null && err.contains("429")) {
                            alert.setContentText("YouTube has temporarily blocked your IP (HTTP Error 429: Too Many Requests). Please wait a few minutes before trying again, or use a VPN.");
                        } else if (err != null && err.contains("PO Token")) {
                            alert.setContentText("YouTube is blocking yt-dlp (PO Token required). Wait for a yt-dlp update or try again later.");
                        } else {
                            alert.setContentText("Failed to extract video formats from YouTube. They may have updated their bot protection.\n\nError: " + (err != null ? err : "Unknown Error"));
                        }
                        alert.showAndWait();
                    });
                    return; // Abort opening the dialog
                }

                final io.smartdm.media.api.MediaMetadata finalMeta;
                if (meta != null && meta.formats() != null && !meta.formats().isEmpty()) {
                    String webpageUrl = (meta.webpageUrl() != null && !meta.webpageUrl().isBlank()) ? meta.webpageUrl() : url;
                    String title = (meta.title() != null && !meta.title().isBlank()) ? meta.title() : deriveTitleFromUrl(url);
                    finalMeta = new io.smartdm.media.api.MediaMetadata(
                        meta.id(), title, meta.durationSeconds(), webpageUrl,
                        meta.thumbnailUrl(), meta.formats(), meta.subtitles()
                    );
                } else {
                    String titleName = deriveTitleFromUrl(targetStreamUrl);
                    String selFmt = (preferredFormatId != null && !preferredFormatId.isBlank()) ? preferredFormatId : "best";
                    String qualityLabel = selFmt.contains("1080") ? "1080p HD" : (selFmt.contains("720") ? "720p HD" : "Best Quality");
                    java.util.List<io.smartdm.media.api.MediaFormat> cleanFormats = java.util.List.of(
                        new io.smartdm.media.api.MediaFormat(selFmt, "mp4", qualityLabel, "MP4", 0, "h264", "aac", 0, 30, false, false)
                    );
                    finalMeta = new io.smartdm.media.api.MediaMetadata("video", titleName, 0, targetStreamUrl, null, cleanFormats, java.util.List.of());
                }

                javafx.application.Platform.runLater(() -> {
                    io.smartdm.desktop.shell.MediaDownloadDialog dlg = new io.smartdm.desktop.shell.MediaDownloadDialog(
                        null,
                        finalMeta,
                        preferredFormatId,
                        dl -> {
                            repository.save(dl);
                            if (workspaceRef[0] != null) workspaceRef[0].addDownload(dl);
                        },
                        smartFolderService,
                        repository
                    );
                    bringStageToFrontAndFocus(dlg);
                });
            });
        } else {
            // Open standard file download dialog
            javafx.application.Platform.runLater(() -> {
                io.smartdm.desktop.shell.AddDownloadDialog d = new io.smartdm.desktop.shell.AddDownloadDialog(null, repository.findAll(), smartFolderService);
                d.setOnDownloadAdded(dl -> {
                    repository.save(dl);
                    if (dl.state() == io.smartdm.domain.DownloadState.QUEUED) {
                        io.smartdm.domain.QueueItem item = new io.smartdm.domain.QueueItem(java.util.UUID.randomUUID().toString(), "main-queue", dl.id(), 1, mainQueueItems.size());
                        mainQueueItems.add(item);
                        if (queueCoordinatorRef.get() != null) queueCoordinatorRef.get().updateQueueItems("main-queue", mainQueueItems);
                    } else {
                        enginePool.submit(() -> coordinator.execute(dl));
                    }
                    if (workspaceRef[0] != null) workspaceRef[0].refresh();
                });
                d.setUrlText(url);
                bringStageToFrontAndFocus(d);
            });
        }
    }


    private static void bringStageToFrontAndFocus(Stage stage) {
        stage.centerOnScreen();
        stage.setAlwaysOnTop(true);
        stage.show();
        stage.toFront();
        stage.requestFocus();
    }

    public static void main(String[] args) {
        launch(args);
    }
}

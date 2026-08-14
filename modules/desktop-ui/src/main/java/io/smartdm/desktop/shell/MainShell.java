package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Pane;
import javafx.scene.control.Label;
import javafx.scene.shape.SVGPath;
import javafx.stage.Stage;
import javafx.stage.WindowEvent;
import javafx.geometry.Pos;


import java.util.function.Consumer;
import io.smartdm.domain.Download;
import javafx.application.Platform;

public final class MainShell extends VBox {
    
    private double xOffset = 0;
    private double yOffset = 0;
    private final NavigationRail navigationRail;
    private final TopBar topBar;
    private QueueWorkspace queueWorkspace;
    private SchedulerWorkspace schedulerWorkspace;
    private CatalogWorkspace catalogWorkspace;
    private SettingsWorkspace settingsWorkspace;

    public MainShell(Stage stage, Consumer<Download> onDownloadRequested, DownloadsWorkspace workspace, io.smartdm.domain.DownloadQueue mainQueue, javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange, java.util.function.Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate) {
        this(stage, onDownloadRequested, workspace, mainQueue, mainQueueItems, onQueueStatusChange, scheduledDownloadsSupplier, onDownloadUpdate, null, null);
    }

    public MainShell(Stage stage, Consumer<Download> onDownloadRequested, DownloadsWorkspace workspace, io.smartdm.domain.DownloadQueue mainQueue, javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange, java.util.function.Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate, io.smartdm.catalog.CatalogService catalogService) {
        this(stage, onDownloadRequested, workspace, mainQueue, mainQueueItems, onQueueStatusChange, scheduledDownloadsSupplier, onDownloadUpdate, catalogService, null);
    }

    public MainShell(Stage stage, Consumer<Download> onDownloadRequested, DownloadsWorkspace workspace, io.smartdm.domain.DownloadQueue mainQueue, javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange, java.util.function.Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate, io.smartdm.catalog.CatalogService catalogService, io.smartdm.organization.SmartFolderService smartFolderService) {
        getStyleClass().addAll("os-window", "glass");
        
        // Custom Title Bar
        HBox titleBar = new HBox();
        titleBar.getStyleClass().add("titlebar");
        
        Region appIcon = new Region();
        appIcon.getStyleClass().add("app-icon");
        
        Label titleLabel = new Label("SmartDM");
        titleLabel.getStyleClass().add("app-title");
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        // Window Controls
        HBox winCaption = new HBox();
        winCaption.getStyleClass().add("win-caption");
        
        javafx.scene.layout.StackPane minBtn = new javafx.scene.layout.StackPane();
        minBtn.getStyleClass().addAll("cap-btn");
        minBtn.setOnMouseClicked(e -> stage.setIconified(true));
        SVGPath minIcon = new SVGPath();
        minIcon.setContent("M6 14 L18 14");
        minIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        minIcon.getStyleClass().add("cap-icon");
        minBtn.getChildren().add(minIcon);
        
        javafx.scene.layout.StackPane maxBtn = new javafx.scene.layout.StackPane();
        maxBtn.getStyleClass().addAll("cap-btn");
        maxBtn.setOnMouseClicked(e -> stage.setMaximized(!stage.isMaximized()));
        SVGPath maxIcon = new SVGPath();
        maxIcon.setContent("M6 6 h12 v12 h-12 z");
        maxIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        maxIcon.getStyleClass().add("cap-icon");
        maxBtn.getChildren().add(maxIcon);

        javafx.scene.layout.StackPane closeBtn = new javafx.scene.layout.StackPane();
        closeBtn.getStyleClass().addAll("cap-btn", "close");
        closeBtn.setOnMouseClicked(e -> stage.fireEvent(new WindowEvent(stage, WindowEvent.WINDOW_CLOSE_REQUEST)));
        SVGPath closeIcon = new SVGPath();
        closeIcon.setContent("M18 6 L6 18 M6 6 L18 18");
        closeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        closeIcon.getStyleClass().add("cap-icon");
        closeBtn.getChildren().add(closeIcon);
        
        winCaption.getChildren().addAll(minBtn, maxBtn, closeBtn);
        titleBar.getChildren().addAll(appIcon, titleLabel, spacer, winCaption);
        
        // Dragging
        titleBar.setOnMousePressed(event -> {
            xOffset = event.getSceneX();
            yOffset = event.getSceneY();
        });
        titleBar.setOnMouseDragged(event -> {
            if (!stage.isMaximized()) {
                stage.setX(event.getScreenX() - xOffset);
                stage.setY(event.getScreenY() - yOffset);
            }
        });

        // Window Border Resizing for Undecorated Stage
        final int RESIZE_MARGIN = 8;
        setOnMouseMoved(event -> {
            if (stage.isMaximized()) {
                setCursor(javafx.scene.Cursor.DEFAULT);
                return;
            }
            double x = event.getX();
            double y = event.getY();
            double w = getWidth();
            double h = getHeight();

            if (x > w - RESIZE_MARGIN && y > h - RESIZE_MARGIN) setCursor(javafx.scene.Cursor.SE_RESIZE);
            else if (x < RESIZE_MARGIN && y > h - RESIZE_MARGIN) setCursor(javafx.scene.Cursor.SW_RESIZE);
            else if (x > w - RESIZE_MARGIN && y < RESIZE_MARGIN) setCursor(javafx.scene.Cursor.NE_RESIZE);
            else if (x < RESIZE_MARGIN && y < RESIZE_MARGIN) setCursor(javafx.scene.Cursor.NW_RESIZE);
            else if (x > w - RESIZE_MARGIN) setCursor(javafx.scene.Cursor.E_RESIZE);
            else if (x < RESIZE_MARGIN) setCursor(javafx.scene.Cursor.W_RESIZE);
            else if (y > h - RESIZE_MARGIN) setCursor(javafx.scene.Cursor.S_RESIZE);
            else if (y < RESIZE_MARGIN) setCursor(javafx.scene.Cursor.N_RESIZE);
            else setCursor(javafx.scene.Cursor.DEFAULT);
        });

        final double[] resizeStart = new double[4];
        setOnMousePressed(event -> {
            if (stage.isMaximized()) return;
            double x = event.getX();
            double y = event.getY();
            double w = getWidth();
            double h = getHeight();
            if (x < RESIZE_MARGIN || x > w - RESIZE_MARGIN || y < RESIZE_MARGIN || y > h - RESIZE_MARGIN) {
                resizeStart[0] = event.getScreenX();
                resizeStart[1] = event.getScreenY();
                resizeStart[2] = stage.getWidth();
                resizeStart[3] = stage.getHeight();
                resizeStart[4] = stage.getX();
                resizeStart[5] = stage.getY();
            }
        });

        setOnMouseDragged(event -> {
            if (stage.isMaximized() || getCursor() == javafx.scene.Cursor.DEFAULT) return;
            javafx.scene.Cursor c = getCursor();
            double dx = event.getScreenX() - resizeStart[0];
            double dy = event.getScreenY() - resizeStart[1];

            if (c == javafx.scene.Cursor.SE_RESIZE || c == javafx.scene.Cursor.E_RESIZE || c == javafx.scene.Cursor.NE_RESIZE) {
                stage.setWidth(Math.max(stage.getMinWidth(), resizeStart[2] + dx));
            }
            if (c == javafx.scene.Cursor.SE_RESIZE || c == javafx.scene.Cursor.S_RESIZE || c == javafx.scene.Cursor.SW_RESIZE) {
                stage.setHeight(Math.max(stage.getMinHeight(), resizeStart[3] + dy));
            }
            if (c == javafx.scene.Cursor.SW_RESIZE || c == javafx.scene.Cursor.W_RESIZE || c == javafx.scene.Cursor.NW_RESIZE) {
                double newW = Math.max(stage.getMinWidth(), resizeStart[2] - dx);
                if (newW > stage.getMinWidth()) {
                    stage.setX(resizeStart[4] + dx);
                    stage.setWidth(newW);
                }
            }
            if (c == javafx.scene.Cursor.NE_RESIZE || c == javafx.scene.Cursor.N_RESIZE || c == javafx.scene.Cursor.NW_RESIZE) {
                double newH = Math.max(stage.getMinHeight(), resizeStart[3] - dy);
                if (newH > stage.getMinHeight()) {
                    stage.setY(resizeStart[5] + dy);
                    stage.setHeight(newH);
                }
            }
        });

        // App Body - Native Layout
        HBox body = new HBox();
        VBox.setVgrow(body, Priority.ALWAYS);
        
        navigationRail = new NavigationRail();
        
        VBox mainContent = new VBox();
        HBox.setHgrow(mainContent, Priority.ALWAYS);
        
        VBox.setVgrow(workspace, Priority.ALWAYS);
        
        topBar = new TopBar(() -> workspace.getDownloadsList(), download -> {
            workspace.addDownload(download, true);
            onDownloadRequested.accept(download);
        }, () -> {
            if (onQueueStatusChange != null) {
                onQueueStatusChange.accept(io.smartdm.domain.DownloadQueue.Status.ACTIVE);
            }
        }, () -> {
            String nav = navigationRail.getCurrentNav();
            if ("Downloads".equals(nav) && workspace != null) {
                workspace.deleteSelected();
            } else if ("Queue".equals(nav) && queueWorkspace != null) {
                queueWorkspace.deleteSelected();
            } else if ("Scheduler".equals(nav) && schedulerWorkspace != null) {
                schedulerWorkspace.deleteSelected();
            }
        }, smartFolderService);
        
        topBar.setOnSearchQueryListener(query -> {
            if (workspace != null) {
                workspace.applySearchQuery(query);
            }
        });
        
        queueWorkspace = new QueueWorkspace(mainQueue, mainQueueItems, workspace, onQueueStatusChange, scheduledDownloadsSupplier, onDownloadUpdate);
        VBox.setVgrow(queueWorkspace, Priority.ALWAYS);
        
        schedulerWorkspace = new SchedulerWorkspace(scheduledDownloadsSupplier, onDownloadUpdate, mainQueueItems, workspace);
        VBox.setVgrow(schedulerWorkspace, Priority.ALWAYS);

        if (catalogService != null) {
            catalogWorkspace = new CatalogWorkspace(catalogService);
            VBox.setVgrow(catalogWorkspace, Priority.ALWAYS);
        }

        settingsWorkspace = new SettingsWorkspace();
        VBox.setVgrow(settingsWorkspace, Priority.ALWAYS);

        SafetyWorkspace safetyWorkspace = new SafetyWorkspace();
        VBox.setVgrow(safetyWorkspace, Priority.ALWAYS);
        
        StatusBar statusBar = new StatusBar();

        io.smartdm.ai.gemini.AiProviderConfig initialAiCfg = io.smartdm.ai.gemini.AiProviderConfig.loadFromDisk();
        statusBar.setAiStatus("AI: disabled");
        if (initialAiCfg != null && initialAiCfg.enabled()) {
            String name = initialAiCfg.providerType() == io.smartdm.ai.api.AiProviderType.GEMINI ? "Gemini: active" : "Local AI: active";
            statusBar.setAiStatus(name);
            io.smartdm.ai.api.OptionalAiAdvisor initialAdvisor = initialAiCfg.providerType() == io.smartdm.ai.api.AiProviderType.OPENAI_COMPATIBLE
                ? new io.smartdm.ai.gemini.OpenAiCompatibleAdvisor(initialAiCfg)
                : new io.smartdm.ai.gemini.GeminiAiAdvisor(initialAiCfg);
            if (workspace != null && workspace.getSearchService() != null) {
                workspace.getSearchService().setAiAdvisor(initialAdvisor);
            }
        }

        javafx.animation.AnimationTimer statusMetricsTimer = new javafx.animation.AnimationTimer() {
            private long lastUpdate = 0;
            @Override
            public void handle(long now) {
                if (now - lastUpdate >= 400_000_000L) {
                    if (workspace != null) {
                        java.util.List<Download> all = workspace.getDownloadsList();
                        double totalSpeed = 0;
                        int active = 0;
                        int queued = 0;
                        long totalBytes = 0;

                        for (Download d : all) {
                            if (d.state() == io.smartdm.domain.DownloadState.DOWNLOADING || d.state() == io.smartdm.domain.DownloadState.PROBING) {
                                active++;
                                SpeedEtaCalculator.SpeedEtaResult res = SpeedEtaCalculator.calculate(d);
                                totalSpeed += res.speedBps();
                            } else if (d.state() == io.smartdm.domain.DownloadState.QUEUED || d.state() == io.smartdm.domain.DownloadState.PAUSED) {
                                queued++;
                            }

                            if (d.downloadedBytes() != null && d.downloadedBytes().value() > 0) {
                                totalBytes += d.downloadedBytes().value();
                            }
                        }

                        statusBar.updateMetrics(totalSpeed, 0.0, active, queued, totalBytes);
                    }
                    lastUpdate = now;
                }
            }
        };
        statusMetricsTimer.start();

        settingsWorkspace.setOnConfigChanged(cfg -> {
            io.smartdm.ai.api.OptionalAiAdvisor newAdvisor = cfg.providerType() == io.smartdm.ai.api.AiProviderType.OPENAI_COMPATIBLE
                ? new io.smartdm.ai.gemini.OpenAiCompatibleAdvisor(cfg)
                : new io.smartdm.ai.gemini.GeminiAiAdvisor(cfg);
            if (workspace != null && workspace.getSearchService() != null) {
                workspace.getSearchService().setAiAdvisor(newAdvisor);
            }
            if (cfg.enabled()) {
                String name = cfg.providerType() == io.smartdm.ai.api.AiProviderType.GEMINI ? "Gemini: active" : "Local AI: active";
                statusBar.setAiStatus(name);
            } else {
                statusBar.setAiStatus("AI: disabled");
            }
        });

        mainContent.getChildren().addAll(topBar, workspace, statusBar);
        
        navigationRail.setOnNavigated(nav -> {
            mainContent.getChildren().clear();
            if ("Downloads".equals(nav)) {
                mainContent.getChildren().addAll(topBar, workspace, statusBar);
            } else if ("Queue".equals(nav)) {
                mainContent.getChildren().addAll(topBar, queueWorkspace, statusBar);
            } else if ("Scheduler".equals(nav)) {
                mainContent.getChildren().addAll(topBar, schedulerWorkspace, statusBar);
            } else if ("Catalog".equals(nav) && catalogWorkspace != null) {
                mainContent.getChildren().addAll(topBar, catalogWorkspace, statusBar);
            } else if ("Safety".equals(nav)) {
                safetyWorkspace.refreshQuarantineList();
                mainContent.getChildren().addAll(topBar, safetyWorkspace, statusBar);
            } else if ("Settings".equals(nav)) {
                mainContent.getChildren().addAll(topBar, settingsWorkspace, statusBar);
            } else {
                // other views placeholder
                VBox placeholder = new VBox(new Label(nav + " (Coming Soon)"));
                placeholder.setAlignment(Pos.CENTER);
                placeholder.getStyleClass().add("workspace");
                VBox.setVgrow(placeholder, Priority.ALWAYS);
                mainContent.getChildren().addAll(topBar, placeholder, statusBar);
            }
        });
        
        body.getChildren().addAll(navigationRail, mainContent);

        getChildren().addAll(titleBar, body);
        
        // Clipboard Monitoring logic moved to TopBar
    }

    public NavigationRail getNavigationRail() {
        return navigationRail;
    }

    public TopBar getTopBar() {
        return topBar;
    }
    
    public QueueWorkspace getQueueWorkspace() {
        return queueWorkspace;
    }

    public SchedulerWorkspace getSchedulerWorkspace() {
        return schedulerWorkspace;
    }
}

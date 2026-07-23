package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Pane;
import javafx.scene.control.Label;
import javafx.scene.shape.SVGPath;
import javafx.stage.Stage;
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
    private CatalogWorkspace catalogWorkspace;

    public MainShell(Stage stage, Consumer<Download> onDownloadRequested, DownloadsWorkspace workspace, io.smartdm.domain.DownloadQueue mainQueue, javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange, java.util.function.Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate) {
        this(stage, onDownloadRequested, workspace, mainQueue, mainQueueItems, onQueueStatusChange, scheduledDownloadsSupplier, onDownloadUpdate, null);
    }

    public MainShell(Stage stage, Consumer<Download> onDownloadRequested, DownloadsWorkspace workspace, io.smartdm.domain.DownloadQueue mainQueue, javafx.collections.ObservableList<io.smartdm.domain.QueueItem> mainQueueItems, Consumer<io.smartdm.domain.DownloadQueue.Status> onQueueStatusChange, java.util.function.Supplier<java.util.List<Download>> scheduledDownloadsSupplier, Consumer<Download> onDownloadUpdate, io.smartdm.catalog.CatalogService catalogService) {
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
        closeBtn.setOnMouseClicked(e -> stage.close());
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
            stage.setX(event.getScreenX() - xOffset);
            stage.setY(event.getScreenY() - yOffset);
        });

        // App Body - Native Layout
        HBox body = new HBox();
        VBox.setVgrow(body, Priority.ALWAYS);
        
        navigationRail = new NavigationRail();
        
        VBox mainContent = new VBox();
        HBox.setHgrow(mainContent, Priority.ALWAYS);
        
        VBox.setVgrow(workspace, Priority.ALWAYS);
        
        topBar = new TopBar(() -> workspace.getDownloadsList(), download -> {
            workspace.addDownload(download);
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
        });
        
        queueWorkspace = new QueueWorkspace(mainQueue, mainQueueItems, workspace, onQueueStatusChange, scheduledDownloadsSupplier, onDownloadUpdate);
        VBox.setVgrow(queueWorkspace, Priority.ALWAYS);
        
        schedulerWorkspace = new SchedulerWorkspace(scheduledDownloadsSupplier, onDownloadUpdate, mainQueueItems, workspace);
        VBox.setVgrow(schedulerWorkspace, Priority.ALWAYS);

        if (catalogService != null) {
            catalogWorkspace = new CatalogWorkspace(catalogService);
            VBox.setVgrow(catalogWorkspace, Priority.ALWAYS);
        }
        
        StatusBar statusBar = new StatusBar();
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

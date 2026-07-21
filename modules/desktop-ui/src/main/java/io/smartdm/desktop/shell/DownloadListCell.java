package io.smartdm.desktop.shell;

import javafx.animation.Animation;
import javafx.animation.FadeTransition;
import javafx.animation.RotateTransition;
import javafx.animation.Interpolator;
import javafx.animation.AnimationTimer;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ListCell;
import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.scene.shape.SVGPath;
import javafx.util.Duration;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;

import java.util.ArrayList;
import java.util.List;

public class DownloadListCell extends ListCell<io.smartdm.domain.DownloadId> {
    
    public interface Listener {
        void onPause(Download download);
        void onResume(Download download);
        void onCancel(Download download);
        void onDelete(Download download, boolean forcePermanent);
        void onAddToQueue(Download download);
        void onSchedule(Download download);
    }

    private final Listener listener;
    private final DownloadProvider provider;

    private final VBox root = new VBox();
    private final Label nameLbl = new Label();
    private final Label metaLbl = new Label();
    private final Label stLbl = new Label();
    private final SVGPath stIcon = new SVGPath();
    private final HBox statusChip = new HBox();
    private final HBox overallLaneContainer = new HBox();
    private final Region overallLane = new Region();
    private final HBox lanes = new HBox();
    private final Label progressTxt = new Label();
    private final HBox rowFoot = new HBox();

    private final Button playPauseBtn = new Button();
    private final SVGPath playPauseIcon = new SVGPath();
    private final Button cancelBtn = new Button();
    private final Button deleteBtn = new Button();

    private final RotateTransition probingRotation = new RotateTransition(Duration.millis(1500), stIcon);
    private final List<FadeTransition> activeTransitions = new ArrayList<>();
    private final Label extLabel = new Label();
    private final javafx.scene.control.CheckBox selectBox = new javafx.scene.control.CheckBox();

    @SuppressWarnings("this-escape")
    public DownloadListCell(Listener listener, DownloadProvider provider) {
        super();
        this.listener = listener;
        this.provider = provider;
        
        if (provider instanceof DownloadsWorkspace) {
            ((DownloadsWorkspace) provider).latestUpdateProperty().addListener((obs, oldV, newV) -> {
                if (newV != null && getItem() != null && newV.id().equals(getItem())) {
                    refreshUI(newV);
                }
            });
        }
        
        getStyleClass().add("download-cell");
        
        root.getStyleClass().add("row");
        
        rowTop.setMinWidth(0);
        
        selectBox.getStyleClass().add("row-checkbox");
        selectBox.setFocusTraversable(false);
        // Bind checkbox to cell selection
        selectedProperty().addListener((obs, wasSelected, isSelected) -> {
            selectBox.setSelected(isSelected != null && isSelected);
            if (isSelected != null && isSelected) {
                if (!root.getStyleClass().contains("selected")) root.getStyleClass().add("selected");
            } else {
                root.getStyleClass().remove("selected");
            }
        });
        selectBox.setOnAction(e -> {
            if (selectBox.isSelected()) {
                getListView().getSelectionModel().select(getItem());
            } else {
                getListView().getSelectionModel().clearSelection(getIndex());
            }
        });
        
        // Drag selection is handled by RubberBandSelection
        
        StackPane fileIcon = new StackPane();
        fileIcon.getStyleClass().add("file-icon");
        fileIcon.setMinWidth(Region.USE_PREF_SIZE);
        extLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-text-fill: #F3F5FC;");
        fileIcon.getChildren().add(extLabel);
        
        VBox rowInfo = new VBox();
        rowInfo.getStyleClass().add("row-info");
        rowInfo.setMinWidth(0);
        HBox.setHgrow(rowInfo, Priority.ALWAYS);
        
        HBox nameWrap = new HBox(8);
        nameWrap.getStyleClass().add("row-name");
        nameWrap.setMinWidth(0);
        nameWrap.setAlignment(Pos.CENTER_LEFT);
        
        nameLbl.setMinWidth(0);
        nameLbl.setTextOverrun(javafx.scene.control.OverrunStyle.ELLIPSIS);
        statusChip.setMinWidth(Region.USE_PREF_SIZE);

        statusChip.getStyleClass().addAll("status-chip");
        stIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
        statusChip.getChildren().addAll(stIcon, stLbl);
        
        nameWrap.getChildren().addAll(nameLbl, statusChip);
        
        metaLbl.getStyleClass().add("row-meta");
        metaLbl.setMinWidth(0);
        metaLbl.setTextOverrun(javafx.scene.control.OverrunStyle.ELLIPSIS);
        
        rowInfo.getChildren().addAll(nameWrap, metaLbl);

        // Control Buttons Panel
        HBox controlBox = new HBox(8);
        controlBox.setAlignment(Pos.CENTER_RIGHT);
        controlBox.setMinWidth(Region.USE_PREF_SIZE);

        playPauseBtn.getStyleClass().add("cell-action-btn");
        playPauseIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.2; -fx-fill: transparent;");
        playPauseBtn.setGraphic(playPauseIcon);
        playPauseBtn.setOnAction(e -> {
            io.smartdm.domain.DownloadId id = getItem();
            if (id != null) {
                Download download = provider.getDownload(id);
                if (download != null) {
                    if (download.state() == DownloadState.DOWNLOADING || download.state() == DownloadState.PROBING) {
                        listener.onPause(download);
                    } else {
                        listener.onResume(download);
                    }
                }
            }
        });

        cancelBtn.getStyleClass().add("cell-action-btn");
        SVGPath cancelIcon = new SVGPath();
        cancelIcon.setContent("M6 6 h12 v12 h-12 z"); // Stop Square SVG
        cancelIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.2; -fx-fill: transparent;");
        cancelBtn.setGraphic(cancelIcon);
        cancelBtn.setOnAction(e -> {
            io.smartdm.domain.DownloadId id = getItem();
            if (id != null) {
                Download download = provider.getDownload(id);
                if (download != null) listener.onCancel(download);
            }
        });

        deleteBtn.getStyleClass().add("cell-action-btn");
        SVGPath deleteIcon = new SVGPath();
        deleteIcon.setContent("M3 6 h18 M19 6 v14 a2 2 0 0 1-2 2 H7 a2 2 0 0 1-2-2 V6 m3 0 V4 a2 2 0 0 1 2-2 h4 a2 2 0 0 1 2 2 v2"); // Trash SVG
        deleteIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.2; -fx-fill: transparent;");
        deleteBtn.setGraphic(deleteIcon);
        deleteBtn.setOnAction(e -> {
            io.smartdm.domain.DownloadId id = getItem();
            if (id != null) {
                Download download = provider.getDownload(id);
                if (download != null) listener.onDelete(download, false);
            }
        });

        controlBox.getChildren().addAll(playPauseBtn, cancelBtn, deleteBtn);
        rowTop.getChildren().addAll(selectBox, fileIcon, rowInfo, controlBox);
        
        overallLaneContainer.getStyleClass().add("lanes");
        overallLane.getStyleClass().add("lane");
        HBox.setHgrow(overallLane, Priority.ALWAYS);
        overallLaneContainer.getChildren().add(overallLane);

        lanes.getStyleClass().add("lanes");
        
        VBox progressBars = new VBox(4);
        progressBars.getChildren().addAll(overallLaneContainer, lanes);
        
        rowFoot.getStyleClass().add("row-foot");
        rowFoot.setMinWidth(0);
        progressTxt.setText("1 parallel segment");
        progressTxt.getStyleClass().add("row-progress-txt");
        progressTxt.setMinWidth(0);
        progressTxt.setTextOverrun(javafx.scene.control.OverrunStyle.ELLIPSIS);
        
        HBox safeChip = new HBox();
        safeChip.getStyleClass().addAll("status-chip", "ok");
        safeChip.setMinWidth(Region.USE_PREF_SIZE);
        SVGPath safeIcon = new SVGPath();
        safeIcon.setContent("M20 6 L9 17 L4 12");
        safeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
        Label safeLbl = new Label("No threats detected");
        safeChip.getChildren().addAll(safeIcon, safeLbl);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        rowFoot.getChildren().addAll(progressTxt, spacer, safeChip);
        
        root.getChildren().addAll(rowTop, progressBars, rowFoot);
        probingRotation.setByAngle(360);
        probingRotation.setCycleCount(Animation.INDEFINITE);
        probingRotation.setInterpolator(Interpolator.LINEAR);
        
        javafx.scene.control.ContextMenu ctxMenu = new javafx.scene.control.ContextMenu();
        
        // Add main stylesheet to the popup
        ctxMenu.getScene().getStylesheets().add(getClass().getResource("/io/smartdm/desktop/theme/main.css").toExternalForm());
        ctxMenu.getStyleClass().add("context-menu");

        javafx.scene.control.MenuItem openItem = new javafx.scene.control.MenuItem("Open");
        javafx.scene.control.MenuItem openWithItem = new javafx.scene.control.MenuItem("Open with...");
        javafx.scene.control.MenuItem openFolderItem = new javafx.scene.control.MenuItem("Open folder");
        
        javafx.scene.control.MenuItem moveRenameItem = new javafx.scene.control.MenuItem("Move/Rename (Ctrl-M)");
        javafx.scene.control.MenuItem redownloadItem = new javafx.scene.control.MenuItem("Redownload");
        
        javafx.scene.control.MenuItem resumeItem = new javafx.scene.control.MenuItem("Resume Download");
        javafx.scene.control.MenuItem stopItem = new javafx.scene.control.MenuItem("Stop Download");
        
        javafx.scene.control.MenuItem refreshItem = new javafx.scene.control.MenuItem("Refresh download address");
        javafx.scene.control.MenuItem removeItem = new javafx.scene.control.MenuItem("Remove");

        javafx.scene.control.Menu queueMenu = new javafx.scene.control.Menu("Add to queue");
        javafx.scene.control.MenuItem queueItem = new javafx.scene.control.MenuItem("Main Queue");
        javafx.scene.control.MenuItem timerItem = new javafx.scene.control.MenuItem("Set Timer...");
        queueMenu.getItems().addAll(queueItem, timerItem);
        
        javafx.scene.control.MenuItem deleteQueueItem = new javafx.scene.control.MenuItem("Delete from queue");
        javafx.scene.control.Menu doubleClickMenu = new javafx.scene.control.Menu("On Double click");
        javafx.scene.control.MenuItem propertiesItem = new javafx.scene.control.MenuItem("Properties");

        ctxMenu.getItems().addAll(
                openItem, openWithItem, openFolderItem, 
                new javafx.scene.control.SeparatorMenuItem(),
                moveRenameItem,
                new javafx.scene.control.SeparatorMenuItem(),
                redownloadItem,
                new javafx.scene.control.SeparatorMenuItem(),
                resumeItem, stopItem,
                new javafx.scene.control.SeparatorMenuItem(),
                refreshItem,
                new javafx.scene.control.SeparatorMenuItem(),
                removeItem,
                new javafx.scene.control.SeparatorMenuItem(),
                queueMenu, deleteQueueItem,
                new javafx.scene.control.SeparatorMenuItem(),
                doubleClickMenu,
                new javafx.scene.control.SeparatorMenuItem(),
                propertiesItem
        );

        queueItem.setOnAction(e -> {
            io.smartdm.domain.DownloadId id = getItem();
            if (id != null) {
                Download d = provider.getDownload(id);
                if (d != null) listener.onAddToQueue(d);
            }
        });
        
        timerItem.setOnAction(e -> {
            io.smartdm.domain.DownloadId id = getItem();
            if (id != null) {
                Download d = provider.getDownload(id);
                if (d != null) {
                    javafx.stage.Stage owner = (javafx.stage.Stage) getScene().getWindow();
                    io.smartdm.desktop.shell.SetTimerDialog dialog = new io.smartdm.desktop.shell.SetTimerDialog(d, updated -> {
                        listener.onSchedule(updated);
                    });
                    dialog.show();
                }
            }
        });
        
        openItem.setOnAction(e -> {
            Download d = getItem() != null ? provider.getDownload(getItem()) : null;
            if (d != null && d.destination() != null && d.destination().value() != null) {
                try { java.awt.Desktop.getDesktop().open(d.destination().value().toFile()); } catch (Exception ex) { ex.printStackTrace(); }
            }
        });
        
        openFolderItem.setOnAction(e -> {
            Download d = getItem() != null ? provider.getDownload(getItem()) : null;
            if (d != null && d.destination() != null && d.destination().value() != null) {
                try { java.awt.Desktop.getDesktop().open(d.destination().value().getParent().toFile()); } catch (Exception ex) { ex.printStackTrace(); }
            }
        });
        
        resumeItem.setOnAction(e -> {
            Download d = getItem() != null ? provider.getDownload(getItem()) : null;
            if (d != null) listener.onResume(d);
        });
        
        stopItem.setOnAction(e -> {
            Download d = getItem() != null ? provider.getDownload(getItem()) : null;
            if (d != null) listener.onPause(d);
        });
        
        removeItem.setOnAction(e -> {
            Download d = getItem() != null ? provider.getDownload(getItem()) : null;
            if (d != null) listener.onDelete(d, false);
        });
        
        deleteQueueItem.setOnAction(e -> {
            Download d = getItem() != null ? provider.getDownload(getItem()) : null;
            if (d != null) listener.onDelete(d, false);
        });
        
        setContextMenu(ctxMenu);
    }

    private void clearAnimations() {
        for (FadeTransition ft : activeTransitions) {
            ft.stop();
        }
        activeTransitions.clear();
    }

    private void updateSvgContent(SVGPath path, String newContent) {
        if (!newContent.equals(path.getContent())) {
            path.setContent(newContent);
        }
    }

    private void updateSvgStyle(SVGPath path, String newStyle) {
        if (!newStyle.equals(path.getStyle())) {
            path.setStyle(newStyle);
        }
    }

    @Override
    protected void updateItem(io.smartdm.domain.DownloadId id, boolean empty) {
        super.updateItem(id, empty);
        
        if (empty || id == null) {
            pollingTimer.stop();
            clearAnimations();
            setGraphic(null);
            setText(null);
        } else {
            Download download = provider.getDownload(id);
            if (download != null) refreshUI(download);
            pollingTimer.start();
            if (getGraphic() != root) {
                setGraphic(root);
            }
        }
    }

    private final AnimationTimer pollingTimer = new AnimationTimer() {
        private long lastUpdate = 0;
        @Override
        public void handle(long now) {
            if (now - lastUpdate >= 100_000_000L) { // 100ms
                io.smartdm.domain.DownloadId id = getItem();
                if (id != null) {
                    Download d = provider.getDownload(id);
                    if (d != null) refreshUI(d);
                }
                lastUpdate = now;
            }
        }
    };

    private void refreshUI(Download download) {
        String fileName = download.destination().value().getFileName().toString();
            if (!fileName.equals(nameLbl.getText())) nameLbl.setText(fileName);
            
            String ext = "";
            int dotIndex = fileName.lastIndexOf('.');
            if (dotIndex > 0 && dotIndex < fileName.length() - 1) {
                ext = fileName.substring(dotIndex + 1).toUpperCase();
                if (ext.length() > 4) ext = ext.substring(0, 4);
            }
            if (!ext.equals(extLabel.getText())) extLabel.setText(ext);
            
            long downloadedBytes = download.downloadedBytes().value();
            long totalBytes = download.totalBytes().value();
            String total = totalBytes > 0 ? (totalBytes / 1024 / 1024) + " MB" : "-";
            String progressPercent = "";
            if (totalBytes > 0 && downloadedBytes >= 0) {
                long pct = (downloadedBytes * 100) / totalBytes;
                progressPercent = " (" + pct + "%)";
            }
            
            String url = download.source().value().getHost() != null ? download.source().value().getHost() : download.source().value().toString();
            String scheduleText = "";
            if (download.scheduledStartTime() != null) {
                long diff = download.scheduledStartTime() - System.currentTimeMillis();
                if (diff > 0) {
                    long minutes = diff / (60 * 1000);
                    if (minutes > 60) {
                        scheduleText = " · Starts in ~" + (minutes / 60) + "h";
                    } else {
                        scheduleText = " · Starts in ~" + minutes + "m";
                    }
                } else {
                    scheduleText = " · Starting now...";
                }
            }
            String metaText = url + " · " + total + progressPercent + scheduleText + " · ETA -";
            if (!metaText.equals(metaLbl.getText())) metaLbl.setText(metaText);
            
            String targetClass;
            if (download.state() == DownloadState.COMPLETED) targetClass = "ok";
            else if (download.state() == DownloadState.DOWNLOADING) targetClass = "Downloading";
            else if (download.state() == DownloadState.FAILED) targetClass = "error";
            else targetClass = "neutral";
            
            if (!statusChip.getStyleClass().contains(targetClass)) {
                statusChip.getStyleClass().removeAll("ok", "neutral", "error", "Downloading");
                statusChip.getStyleClass().add(targetClass);
            }

            // Setup button states and colors based on state
            playPauseBtn.setVisible(true);
            cancelBtn.setVisible(true);
            
            if (download.state() == DownloadState.COMPLETED) {
                if (!"Completed".equals(stLbl.getText())) stLbl.setText("Completed");
                updateSvgContent(stIcon, "M20 6 L9 17 L4 12");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
                updateSvgContent(playPauseIcon, "M10 4 H4 c-1.1 0-1.99.9-1.99 2 L2 18c0 1.1.9 2 2 2 h16 c1.1 0 2-.9 2-2 V8 c0-1.1-.9-2-2-2 h-8 l-2-2 z"); // Folder icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                overallLaneContainer.setVisible(true);
                overallLaneContainer.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
                playPauseBtn.setVisible(false); 
                cancelBtn.setVisible(false);
            } else if (download.state() == DownloadState.DOWNLOADING) {
                if (!"Downloading".equals(stLbl.getText())) stLbl.setText("Downloading");
                updateSvgContent(stIcon, "M19 12 L12 19 L5 12 M12 19 L12 5");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
                updateSvgContent(playPauseIcon, "M6 19 h4 V5 H6 z M14 5 v14 h4 V5 z"); // Pause Icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                overallLaneContainer.setVisible(true);
                overallLaneContainer.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else if (download.state() == DownloadState.FAILED) {
                if (!"Failed".equals(stLbl.getText())) stLbl.setText("Failed");
                updateSvgContent(stIcon, "M18 6 L6 18 M6 6 L18 18");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
                updateSvgContent(playPauseIcon, "M12 4 V1 L8 5 l4 4 V6 c3.31 0 6 2.69 6 6 c0 1.01-0.25 1.97-0.7 2.8 l1.46 1.46 C19.54 15.03 20 13.57 20 12 C20 7.58 16.42 4 12 4 Z M5.23 7.74 l1.46 1.46 C6.25 10.03 6 11.43 6 13 c0 3.31 2.69 6 6 6 v3 l4-4 l-4-4 v3 c-4.42 0-8-3.58-8-8 c0-1.57 0.46-3.03 1.23-4.26 Z"); // Retry icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                overallLaneContainer.setVisible(true);
                overallLaneContainer.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else if (download.state() == DownloadState.CANCELED) {
                if (!"Canceled".equals(stLbl.getText())) stLbl.setText("Canceled");
                updateSvgContent(stIcon, "M18 6 L6 18 M6 6 L18 18");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
                updateSvgContent(playPauseIcon, "M12 4 V1 L8 5 l4 4 V6 c3.31 0 6 2.69 6 6 c0 1.01-0.25 1.97-0.7 2.8 l1.46 1.46 C19.54 15.03 20 13.57 20 12 C20 7.58 16.42 4 12 4 Z M5.23 7.74 l1.46 1.46 C6.25 10.03 6 11.43 6 13 c0 3.31 2.69 6 6 6 v3 l4-4 l-4-4 v3 c-4.42 0-8-3.58-8-8 c0-1.57 0.46-3.03 1.23-4.26 Z"); // Retry icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                overallLaneContainer.setVisible(true);
                overallLaneContainer.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else if (download.state() == DownloadState.PROBING) {
                if (!"Probing...".equals(stLbl.getText())) stLbl.setText("Probing...");
                updateSvgContent(stIcon, "M12 2 A10 10 0 1 1 12 22 A10 10 0 1 1 12 2");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent; -fx-stroke-dash-array: 14 10;");
                updateSvgContent(playPauseIcon, "M6 19 h4 V5 H6 z M14 5 v14 h4 V5 z"); // Pause Icon
                lanes.setVisible(false);
                lanes.setManaged(false);
                overallLaneContainer.setVisible(false);
                overallLaneContainer.setManaged(false);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else if (download.state() == DownloadState.PAUSED) {
                if (!"Paused".equals(stLbl.getText())) stLbl.setText("Paused");
                updateSvgContent(stIcon, "M9 5 L9 19 M15 5 L15 19");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
                updateSvgContent(playPauseIcon, "M8 5 v14 l11-7 z"); // Play Icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                overallLaneContainer.setVisible(true);
                overallLaneContainer.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else {
                if (!"Queued".equals(stLbl.getText())) stLbl.setText("Queued");
                updateSvgContent(stIcon, "M9 5 L9 19 M15 5 L15 19");
                updateSvgStyle(stIcon, "-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
                updateSvgContent(playPauseIcon, "M8 5 v14 l11-7 z"); // Play Icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                overallLaneContainer.setVisible(true);
                overallLaneContainer.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            }

            if (download.state() == DownloadState.PROBING) {
                probingRotation.play();
            } else {
                probingRotation.stop();
                stIcon.setRotate(0);
            }

            // Render active lanes progress visually
            List<DownloadSegment> segments = download.segments();
            String segmentsText = segments.isEmpty() ? "1 parallel segment" : segments.size() + " parallel segments";
            if (!segmentsText.equals(progressTxt.getText())) progressTxt.setText(segmentsText);
            
            double overallProgress = totalBytes > 0 ? (double) downloadedBytes / totalBytes : 0.0;
            if (overallProgress < 0.0) overallProgress = 0.0;
            if (overallProgress > 1.0) overallProgress = 1.0;
            
            String overallColor = "#37E9FF";
            if (download.state() == DownloadState.FAILED || download.state() == DownloadState.CANCELED) {
                overallColor = "#4D526A";
            } else if (download.state() == DownloadState.COMPLETED) {
                overallColor = "#00D68F";
            }
            
            String overallStyle = "-fx-background-color: linear-gradient(to right, " + overallColor + " 0%, " + overallColor + " " + (overallProgress * 100) + "%, rgba(255,255,255,0.08) " + (overallProgress * 100) + "%, rgba(255,255,255,0.08) 100%);";
            if (!overallStyle.equals(overallLane.getStyle())) {
                overallLane.setStyle(overallStyle);
            }
            overallLane.setOpacity(download.state() == DownloadState.FAILED || download.state() == DownloadState.CANCELED ? 0.4 : 1.0);

            if (!segments.isEmpty()) {
                if (lanes.getChildren().size() != segments.size() || activeTransitions.size() != segments.size()) {
                    lanes.getChildren().clear();
                    clearAnimations();
                    for (int i = 0; i < segments.size(); i++) {
                        Region lane = new Region();
                        lane.getStyleClass().add("lane");
                        HBox.setHgrow(lane, Priority.ALWAYS);
                        lanes.getChildren().add(lane);

                        FadeTransition fade = new FadeTransition(Duration.millis(800), lane);
                        fade.setFromValue(1.0);
                        fade.setToValue(0.4);
                        fade.setCycleCount(Animation.INDEFINITE);
                        fade.setAutoReverse(true);
                        activeTransitions.add(fade);
                    }
                }

                String[] colors = {"#37E9FF", "#9B6BFF", "#FF3DCB", "#FFC24B"};
                for (int i = 0; i < segments.size(); i++) {
                    DownloadSegment segment = segments.get(i);
                    Region lane = (Region) lanes.getChildren().get(i);
                    FadeTransition fade = activeTransitions.get(i);

                    double progress = segment.totalBytes() > 0 ? (double) segment.downloadedBytes() / segment.totalBytes() : 0.0;
                    if (progress < 0.0) progress = 0.0;
                    if (progress > 1.0) progress = 1.0;

                    String color = colors[i % colors.length];
                    if (download.state() == DownloadState.FAILED || download.state() == DownloadState.CANCELED) {
                        color = "#4D526A"; // Gray out for failed/canceled
                    } else if (download.state() == DownloadState.COMPLETED) {
                        color = "#00D68F"; // Green for completed
                    }

                    String newStyle = "-fx-background-color: linear-gradient(to right, " + color + " 0%, " + color + " " + (progress * 100) + "%, rgba(255,255,255,0.08) " + (progress * 100) + "%, rgba(255,255,255,0.08) 100%);";
                    if (!newStyle.equals(lane.getStyle())) {
                        lane.setStyle(newStyle);
                    }
                    
                    if (download.state() == DownloadState.DOWNLOADING && progress < 1.0) {
                        if (fade.getStatus() != Animation.Status.RUNNING) {
                            fade.play();
                        }
                    } else {
                        fade.stop();
                        lane.setOpacity(download.state() == DownloadState.FAILED || download.state() == DownloadState.CANCELED ? 0.4 : 1.0);
                    }
                }
            } else {
                if (lanes.getChildren().size() != 1 || !lanes.getChildren().get(0).getStyleClass().contains("lane-1")) {
                    lanes.getChildren().clear();
                    clearAnimations();
                    Region lane = new Region();
                    lane.getStyleClass().addAll("lane", "lane-1");
                    HBox.setHgrow(lane, Priority.ALWAYS);
                    lanes.getChildren().add(lane);
                }
            }
        }
    }

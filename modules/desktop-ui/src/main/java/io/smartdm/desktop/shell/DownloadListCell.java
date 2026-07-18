package io.smartdm.desktop.shell;

import javafx.animation.Animation;
import javafx.animation.FadeTransition;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ListCell;
import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.scene.shape.SVGPath;
import javafx.util.Duration;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;

import java.util.ArrayList;
import java.util.List;

public class DownloadListCell extends ListCell<Download> {
    
    public interface Listener {
        void onPause(Download download);
        void onResume(Download download);
        void onCancel(Download download);
        void onDelete(Download download);
    }

    private final Listener listener;

    private final VBox root = new VBox();
    private final Label nameLbl = new Label();
    private final Label metaLbl = new Label();
    private final Label stLbl = new Label();
    private final SVGPath stIcon = new SVGPath();
    private final HBox statusChip = new HBox();
    private final HBox lanes = new HBox();
    private final HBox rowFoot = new HBox();

    private final Button playPauseBtn = new Button();
    private final SVGPath playPauseIcon = new SVGPath();
    private final Button cancelBtn = new Button();
    private final Button deleteBtn = new Button();

    private final List<FadeTransition> activeTransitions = new ArrayList<>();

    @SuppressWarnings("this-escape")
    public DownloadListCell(Listener listener) {
        super();
        this.listener = listener;
        getStyleClass().add("download-cell");
        
        root.getStyleClass().add("row");
        
        HBox rowTop = new HBox();
        rowTop.getStyleClass().add("row-top");
        rowTop.setSpacing(12);
        
        Region fileIcon = new Region();
        fileIcon.getStyleClass().add("file-icon");
        
        VBox rowInfo = new VBox();
        rowInfo.getStyleClass().add("row-info");
        HBox.setHgrow(rowInfo, Priority.ALWAYS);
        
        HBox nameWrap = new HBox();
        nameWrap.getStyleClass().add("row-name");
        
        statusChip.getStyleClass().addAll("status-chip");
        stIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
        statusChip.getChildren().addAll(stIcon, stLbl);
        
        nameWrap.getChildren().addAll(nameLbl, statusChip);
        metaLbl.getStyleClass().add("row-meta");
        
        rowInfo.getChildren().addAll(nameWrap, metaLbl);

        // Control Buttons Panel
        HBox controlBox = new HBox(8);
        controlBox.setAlignment(Pos.CENTER_RIGHT);

        playPauseBtn.getStyleClass().add("cell-action-btn");
        playPauseIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.2; -fx-fill: transparent;");
        playPauseBtn.setGraphic(playPauseIcon);
        playPauseBtn.setOnAction(e -> {
            Download download = getItem();
            if (download != null) {
                if (download.state() == DownloadState.DOWNLOADING || download.state() == DownloadState.PROBING) {
                    listener.onPause(download);
                } else {
                    listener.onResume(download);
                }
            }
        });

        cancelBtn.getStyleClass().add("cell-action-btn");
        SVGPath cancelIcon = new SVGPath();
        cancelIcon.setContent("M6 6 h12 v12 h-12 z"); // Stop Square SVG
        cancelIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.2; -fx-fill: transparent;");
        cancelBtn.setGraphic(cancelIcon);
        cancelBtn.setOnAction(e -> {
            Download download = getItem();
            if (download != null) {
                listener.onCancel(download);
            }
        });

        deleteBtn.getStyleClass().add("cell-action-btn");
        SVGPath deleteIcon = new SVGPath();
        deleteIcon.setContent("M3 6 h18 M19 6 v14 a2 2 0 0 1-2 2 H7 a2 2 0 0 1-2-2 V6 m3 0 V4 a2 2 0 0 1 2-2 h4 a2 2 0 0 1 2 2 v2"); // Trash SVG
        deleteIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.2; -fx-fill: transparent;");
        deleteBtn.setGraphic(deleteIcon);
        deleteBtn.setOnAction(e -> {
            Download download = getItem();
            if (download != null) {
                listener.onDelete(download);
            }
        });

        controlBox.getChildren().addAll(playPauseBtn, cancelBtn, deleteBtn);
        rowTop.getChildren().addAll(fileIcon, rowInfo, controlBox);
        
        lanes.getStyleClass().add("lanes");
        
        rowFoot.getStyleClass().add("row-foot");
        Label progressTxt = new Label("3 parallel segments");
        progressTxt.getStyleClass().add("row-progress-txt");
        
        HBox safeChip = new HBox();
        safeChip.getStyleClass().addAll("status-chip", "ok");
        SVGPath safeIcon = new SVGPath();
        safeIcon.setContent("M20 6 L9 17 L4 12");
        safeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
        Label safeLbl = new Label("No threats detected");
        safeChip.getChildren().addAll(safeIcon, safeLbl);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        rowFoot.getChildren().addAll(progressTxt, spacer, safeChip);
        
        root.getChildren().addAll(rowTop, lanes, rowFoot);
    }

    private void clearAnimations() {
        for (FadeTransition ft : activeTransitions) {
            ft.stop();
        }
        activeTransitions.clear();
    }

    @Override
    protected void updateItem(Download download, boolean empty) {
        super.updateItem(download, empty);
        clearAnimations();
        
        if (empty || download == null) {
            setGraphic(null);
            setText(null);
        } else {
            nameLbl.setText(download.destination().value().getFileName().toString());
            
            long downloadedBytes = download.downloadedBytes().value();
            long totalBytes = download.totalBytes().value();
            String total = totalBytes > 0 ? (totalBytes / 1024 / 1024) + " MB" : "-";
            String progressPercent = "";
            if (totalBytes > 0 && downloadedBytes >= 0) {
                long pct = (downloadedBytes * 100) / totalBytes;
                progressPercent = " (" + pct + "%)";
            }
            
            String url = download.source().value().getHost() != null ? download.source().value().getHost() : download.source().value().toString();
            metaLbl.setText(url + " · " + total + progressPercent + " · ETA -");
            
            statusChip.getStyleClass().removeAll("ok", "neutral", "error", "Downloading");

            // Setup button states and colors based on state
            playPauseBtn.setVisible(true);
            cancelBtn.setVisible(true);
            
            if (download.state() == DownloadState.COMPLETED) {
                statusChip.getStyleClass().add("ok");
                stLbl.setText("Completed");
                stIcon.setContent("M20 6 L9 17 L4 12");
                lanes.setVisible(false);
                lanes.setManaged(false);
                rowFoot.setVisible(false);
                rowFoot.setManaged(false);
                playPauseBtn.setVisible(false);
                cancelBtn.setVisible(false);
            } else if (download.state() == DownloadState.DOWNLOADING) {
                statusChip.getStyleClass().add("Downloading");
                stLbl.setText("Downloading");
                stIcon.setContent("M19 12 L12 19 L5 12 M12 19 L12 5");
                playPauseIcon.setContent("M6 19 h4 V5 H6 z M14 5 v14 h4 V5 z"); // Pause Icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else if (download.state() == DownloadState.FAILED) {
                statusChip.getStyleClass().add("error");
                stLbl.setText("Failed");
                stIcon.setContent("M18 6 L6 18 M6 6 L18 18");
                lanes.setVisible(false);
                lanes.setManaged(false);
                rowFoot.setVisible(false);
                rowFoot.setManaged(false);
                playPauseBtn.setVisible(false);
                cancelBtn.setVisible(false);
            } else if (download.state() == DownloadState.CANCELED) {
                statusChip.getStyleClass().add("neutral");
                stLbl.setText("Canceled");
                stIcon.setContent("M18 6 L6 18 M6 6 L18 18");
                lanes.setVisible(false);
                lanes.setManaged(false);
                rowFoot.setVisible(false);
                rowFoot.setManaged(false);
                playPauseBtn.setVisible(false);
                cancelBtn.setVisible(false);
            } else if (download.state() == DownloadState.PROBING) {
                statusChip.getStyleClass().add("neutral");
                stLbl.setText("Probing...");
                stIcon.setContent("M12 2 A10 10 0 1 0 12 22");
                playPauseIcon.setContent("M6 19 h4 V5 H6 z M14 5 v14 h4 V5 z"); // Pause Icon
                lanes.setVisible(false);
                lanes.setManaged(false);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else if (download.state() == DownloadState.PAUSED) {
                statusChip.getStyleClass().add("neutral");
                stLbl.setText("Paused");
                stIcon.setContent("M9 5 L9 19 M15 5 L15 19");
                playPauseIcon.setContent("M8 5 v14 l11-7 z"); // Play Icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            } else {
                statusChip.getStyleClass().add("neutral");
                stLbl.setText("Queued");
                stIcon.setContent("M9 5 L9 19 M15 5 L15 19");
                playPauseIcon.setContent("M8 5 v14 l11-7 z"); // Play Icon
                lanes.setVisible(true);
                lanes.setManaged(true);
                rowFoot.setVisible(true);
                rowFoot.setManaged(true);
            }

            // Render active lanes progress visually
            lanes.getChildren().clear();
            List<DownloadSegment> segments = download.segments();
            if (!segments.isEmpty()) {
                String[] colors = {"#37E9FF", "#9B6BFF", "#FF3DCB", "#FFC24B"};
                for (int i = 0; i < segments.size(); i++) {
                    DownloadSegment segment = segments.get(i);
                    Region lane = new Region();
                    lane.getStyleClass().add("lane");
                    HBox.setHgrow(lane, Priority.ALWAYS);

                    double progress = segment.totalBytes() > 0 ? (double) segment.downloadedBytes() / segment.totalBytes() : 0.0;
                    if (progress < 0.0) progress = 0.0;
                    if (progress > 1.0) progress = 1.0;

                    String color = colors[i % colors.length];
                    // CSS inline background linear gradient showing filled vs empty track
                    lane.setStyle("-fx-background-color: linear-gradient(to right, " + color + " 0%, " + color + " " + (progress * 100) + "%, rgba(255,255,255,0.08) " + (progress * 100) + "%, rgba(255,255,255,0.08) 100%);");
                    
                    lanes.getChildren().add(lane);

                    // Pulsing animation if the download is active and this segment is still in progress
                    if (download.state() == DownloadState.DOWNLOADING && progress < 1.0) {
                        FadeTransition fade = new FadeTransition(Duration.millis(800), lane);
                        fade.setFromValue(1.0);
                        fade.setToValue(0.4);
                        fade.setCycleCount(Animation.INDEFINITE);
                        fade.setAutoReverse(true);
                        fade.play();
                        activeTransitions.add(fade);
                    }
                }
            } else {
                // Single fallback lane if segments are not loaded yet
                Region lane = new Region();
                lane.getStyleClass().addAll("lane", "lane-1");
                HBox.setHgrow(lane, Priority.ALWAYS);
                lanes.getChildren().add(lane);
            }
            
            setGraphic(root);
        }
    }
}

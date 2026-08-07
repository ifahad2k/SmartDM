package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadSegment;
import io.smartdm.domain.DownloadState;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.File;
import java.net.URI;
import java.util.List;

public final class DownloadStatusDialog extends GlassmorphicDialog {

    private final Download download;
    private final DownloadActionListener listener;
    private volatile Download activeDownload;
    
    // Labels & UI controls
    private final Label urlText;
    private final Label valFileSize;
    private final Label valDownloaded;
    private final Label valSpeed;
    private final Label valEta;
    private final Label valResume;
    private final Label valHost;
    
    private final Label progressText;
    private final Region progressFill;
    private final StackPane progressWrap;
    
    private final VBox segmentsBox;
    private final ScrollPane segmentsScrollPane;
    private final Button detailsBtn;
    private final Button pauseResumeBtn;
    private final Button cancelBtn;
    
    // Speed Limiter Tab controls
    private final CheckBox enableSpeedLimitCb;
    private final Slider speedLimitSlider;
    private final Label speedLimitValLabel;
    
    // On Completion Tab controls
    private final ComboBox<String> onCompletionCombo;
    
    // Content containers for tabs
    private final VBox statusTabContent;
    private final VBox speedTabContent;
    private final VBox completionTabContent;
    private boolean detailsVisible = false;

    @SuppressWarnings("this-escape")
    public DownloadStatusDialog(Stage owner, Download download, DownloadActionListener listener) {
        super(owner, "SmartDM — Download status", Modality.NONE);
        this.download = download;
        this.activeDownload = download;
        this.listener = listener;

        // Ensure normal OS window stacking behavior (not pinned on top)
        setAlwaysOnTop(false);

        String fileName = download.destination().value().getFileName().toString();
        setTitle("SmartDM — " + fileName);

        // --- TABS BAR ---
        HBox tabs = new HBox(8);
        tabs.getStyleClass().add("tabs");
        tabs.setPadding(new Insets(0, 0, 8, 0));
        
        Label tabStatus = createTabLabel("Download status", true);
        Label tabSpeed = createTabLabel("Speed limiter", false);
        Label tabCompletion = createTabLabel("On completion", false);
        tabs.getChildren().addAll(tabStatus, tabSpeed, tabCompletion);

        ((VBox) root.getCenter()).getChildren().add(0, tabs);

        // --- TAB 1: DOWNLOAD STATUS CONTENT ---
        // Metadata Stats Grid
        GridPane grid = new GridPane();
        grid.setHgap(16);
        grid.setVgap(8);
        grid.setPadding(new Insets(8, 0, 8, 0));

        valHost = createValueLabel(extractHost(download.source().value().toString()));
        valFileSize = createValueLabel("0 B");
        valDownloaded = createValueLabel("0 B");
        valSpeed = createValueLabel("0 B/s");
        valEta = createValueLabel("Unknown");
        valResume = createValueLabel("Yes");

        grid.add(createFieldBox("URL / Host:", valHost), 0, 0);
        grid.add(createFieldBox("File size:", valFileSize), 1, 0);
        grid.add(createFieldBox("Downloaded:", valDownloaded), 0, 1);
        grid.add(createFieldBox("Transfer rate:", valSpeed), 1, 1);
        grid.add(createFieldBox("Time left:", valEta), 0, 2);
        grid.add(createFieldBox("Resume capability:", valResume), 1, 2);

        urlText = valHost;

        // Progress bar container & text
        HBox progressTop = new HBox();
        progressTop.setAlignment(Pos.CENTER_LEFT);
        Label pLabel = new Label("Progress");
        pLabel.getStyleClass().add("ds");
        pLabel.setStyle("-fx-font-weight: bold; -fx-text-fill: #E2E8F0;");
        Region spacer2 = new Region();
        HBox.setHgrow(spacer2, Priority.ALWAYS);
        progressText = new Label("0%");
        progressText.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");
        progressTop.getChildren().addAll(pLabel, spacer2, progressText);

        Region progressTrack = new Region();
        progressTrack.getStyleClass().add("progress-track");
        progressTrack.setStyle("-fx-background-color: rgba(255,255,255,0.08); -fx-background-radius: 6; -fx-min-height: 12;");
        HBox.setHgrow(progressTrack, Priority.ALWAYS);

        progressFill = new Region();
        progressFill.getStyleClass().add("progress-fill");
        progressFill.setStyle("-fx-background-color: linear-gradient(to right, #38BDF8, #818CF8); -fx-background-radius: 6; -fx-min-height: 12;");
        progressFill.setMinWidth(Region.USE_PREF_SIZE);
        progressFill.setMaxWidth(Region.USE_PREF_SIZE);
        progressFill.setPrefWidth(0);

        progressWrap = new StackPane();
        progressWrap.setAlignment(Pos.CENTER_LEFT);
        progressWrap.getChildren().addAll(progressTrack, progressFill);
        progressWrap.widthProperty().addListener((obs, oldW, newW) -> {
            if (newW != null && newW.doubleValue() > 0 && activeDownload != null) {
                long cb = activeDownload.downloadedBytes() != null ? activeDownload.downloadedBytes().value() : 0;
                long tb = activeDownload.totalBytes() != null ? activeDownload.totalBytes().value() : -1;
                if (tb > 0) {
                    double pct = Math.min(100.0, (cb * 100.0) / tb);
                    progressFill.setPrefWidth((pct / 100.0) * newW.doubleValue());
                }
            }
        });

        VBox progContainer = new VBox(6, progressTop, progressWrap);

        // Segment Connection Breakdown Panel (collapsible)
        segmentsBox = new VBox(6);
        segmentsBox.setPadding(new Insets(8));
        segmentsBox.setStyle("-fx-background-color: rgba(15, 23, 42, 0.6); -fx-background-radius: 8; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 8;");

        segmentsScrollPane = new ScrollPane(segmentsBox);
        segmentsScrollPane.setFitToWidth(true);
        segmentsScrollPane.setPrefHeight(120);
        segmentsScrollPane.setManaged(false);
        segmentsScrollPane.setVisible(false);
        segmentsScrollPane.setStyle("-fx-background-color: transparent; -fx-background: transparent;");

        statusTabContent = new VBox(10, grid, progContainer, segmentsScrollPane);

        // --- SPEED LIMITER CONTENT ---
        VBox speedBox = new VBox(12);
        speedBox.setPadding(new Insets(12, 0, 12, 0));
        enableSpeedLimitCb = new CheckBox("Enable Speed Limiter for this download");
        enableSpeedLimitCb.setStyle("-fx-text-fill: #E2E8F0; -fx-font-weight: bold;");

        HBox sliderRow = new HBox(12);
        sliderRow.setAlignment(Pos.CENTER_LEFT);
        speedLimitSlider = new Slider(50, 10000, 1000);
        speedLimitSlider.setDisable(true);
        HBox.setHgrow(speedLimitSlider, Priority.ALWAYS);
        speedLimitValLabel = new Label("1000 KB/s");
        speedLimitValLabel.setStyle("-fx-text-fill: #38BDF8; -fx-font-weight: bold;");

        enableSpeedLimitCb.selectedProperty().addListener((obs, oldV, newV) -> {
            speedLimitSlider.setDisable(!newV);
        });

        speedLimitSlider.valueProperty().addListener((obs, oldV, newV) -> {
            speedLimitValLabel.setText(String.format("%.0f KB/s", newV.doubleValue()));
        });
        sliderRow.getChildren().addAll(speedLimitSlider, speedLimitValLabel);
        speedBox.getChildren().addAll(enableSpeedLimitCb, sliderRow);
        speedTabContent = speedBox;
        speedTabContent.setManaged(false);
        speedTabContent.setVisible(false);

        // --- ON COMPLETION CONTENT ---
        VBox compBox = new VBox(12);
        compBox.setPadding(new Insets(12, 0, 12, 0));
        Label compLabel = new Label("When download completes:");
        compLabel.setStyle("-fx-text-fill: #E2E8F0; -fx-font-weight: bold;");

        onCompletionCombo = new ComboBox<>();
        onCompletionCombo.getItems().addAll(
                "Do nothing",
                "Open file automatically",
                "Open containing folder",
                "Play sound notification",
                "Shutdown computer"
        );
        onCompletionCombo.getSelectionModel().selectFirst();
        onCompletionCombo.setMaxWidth(Double.MAX_VALUE);

        compBox.getChildren().addAll(compLabel, onCompletionCombo);
        completionTabContent = compBox;
        completionTabContent.setManaged(false);
        completionTabContent.setVisible(false);

        // --- BOTTOM ACTION BUTTONS ---
        HBox actions = new HBox(10);
        actions.setPadding(new Insets(12, 0, 0, 0));

        detailsBtn = new Button("Show details");
        detailsBtn.getStyleClass().addAll("btn", "btn-ghost");
        detailsBtn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(detailsBtn, Priority.ALWAYS);
        detailsBtn.setOnAction(e -> toggleDetails());

        pauseResumeBtn = new Button(download.state() == DownloadState.DOWNLOADING || download.state() == DownloadState.PROBING ? "Pause" : "Resume");
        pauseResumeBtn.getStyleClass().addAll("btn", "btn-primary");
        pauseResumeBtn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(pauseResumeBtn, Priority.ALWAYS);
        pauseResumeBtn.setOnAction(e -> {
            if (activeDownload == null) return;
            DownloadState st = activeDownload.state();
            if (st == DownloadState.DOWNLOADING || st == DownloadState.PROBING) {
                if (listener != null) listener.onPause(activeDownload);
            } else if (st == DownloadState.COMPLETED) {
                openCompletedFile(activeDownload);
            } else {
                if (listener != null) listener.onResume(activeDownload);
            }
        });

        cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-secondary");
        cancelBtn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(cancelBtn, Priority.ALWAYS);
        cancelBtn.setOnAction(e -> {
            if (activeDownload != null && activeDownload.state() != DownloadState.COMPLETED && listener != null) {
                listener.onCancel(activeDownload);
            }
            close();
        });

        actions.getChildren().addAll(detailsBtn, pauseResumeBtn, cancelBtn);

        // Tab Switching Logic
        tabStatus.setOnMouseClicked(e -> switchTab(tabStatus, tabSpeed, tabCompletion, statusTabContent));
        tabSpeed.setOnMouseClicked(e -> switchTab(tabSpeed, tabStatus, tabCompletion, speedTabContent));
        tabCompletion.setOnMouseClicked(e -> switchTab(tabCompletion, tabStatus, tabSpeed, completionTabContent));

        dialogBody.getChildren().addAll(statusTabContent, speedTabContent, completionTabContent, actions);

        // Initial Data Refresh
        updateDownload(download);
    }

    public void updateDownload(Download updated) {
        if (updated == null) return;
        this.activeDownload = updated;
        Platform.runLater(() -> {
            long currentBytes = updated.downloadedBytes() != null ? updated.downloadedBytes().value() : 0;
            long totalBytes = updated.totalBytes() != null ? updated.totalBytes().value() : -1;

            valFileSize.setText(formatBytes(totalBytes));
            valDownloaded.setText(formatBytes(currentBytes));

            // Speed & ETA calculations
            SpeedEtaCalculator.SpeedEtaResult speedResult = SpeedEtaCalculator.calculate(updated);
            valSpeed.setText(speedResult.speedFormatted());
            valEta.setText(speedResult.etaFormatted());

            // Progress bar
            double pct = 0;
            if (totalBytes > 0) {
                pct = Math.min(100.0, (currentBytes * 100.0) / totalBytes);
            }
            progressText.setText(String.format("%.1f%%", pct));
            progressFill.setPrefWidth((pct / 100.0) * progressWrap.getWidth());

            // Pause/Resume button state update
            DownloadState st = updated.state();
            if (st == DownloadState.DOWNLOADING || st == DownloadState.PROBING) {
                pauseResumeBtn.setText("Pause");
                pauseResumeBtn.setStyle(null);
                pauseResumeBtn.getStyleClass().removeAll("btn-primary");
                if (!pauseResumeBtn.getStyleClass().contains("btn-secondary")) {
                    pauseResumeBtn.getStyleClass().add("btn-secondary");
                }
                pauseResumeBtn.setDisable(false);
                cancelBtn.setText("Cancel");
                progressFill.setStyle("-fx-background-color: linear-gradient(to right, #38BDF8, #818CF8); -fx-background-radius: 6; -fx-min-height: 12;");
                progressText.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");
            } else if (st == DownloadState.COMPLETED) {
                pauseResumeBtn.setText("Open File");
                pauseResumeBtn.getStyleClass().removeAll("btn-secondary");
                pauseResumeBtn.setStyle("-fx-background-color: linear-gradient(to right, #10b981, #059669); -fx-text-fill: white; -fx-font-weight: bold; -fx-background-radius: 6; -fx-effect: dropshadow(three-pass-box, rgba(16,185,129,0.4), 8, 0, 0, 2);");
                pauseResumeBtn.setDisable(false);
                cancelBtn.setText("Close");
                progressFill.setStyle("-fx-background-color: linear-gradient(to right, #10b981, #059669); -fx-background-radius: 6; -fx-min-height: 12;");
                progressText.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #10b981;");
                handleCompletionAction(updated);
            } else {
                pauseResumeBtn.setText("Resume");
                pauseResumeBtn.setStyle(null);
                pauseResumeBtn.getStyleClass().removeAll("btn-secondary");
                if (!pauseResumeBtn.getStyleClass().contains("btn-primary")) {
                    pauseResumeBtn.getStyleClass().add("btn-primary");
                }
                pauseResumeBtn.setDisable(false);
                cancelBtn.setText("Cancel");
                progressFill.setStyle("-fx-background-color: linear-gradient(to right, #38BDF8, #818CF8); -fx-background-radius: 6; -fx-min-height: 12;");
                progressText.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");
            }

            // Segments details update
            updateSegmentsList(updated.segments());
        });
    }

    private void updateSegmentsList(List<DownloadSegment> segments) {
        segmentsBox.getChildren().clear();
        if (segments == null || segments.isEmpty()) {
            Label noSegs = new Label("Default single-connection transfer");
            noSegs.setStyle("-fx-text-fill: #94A3B8; -fx-font-size: 11px;");
            segmentsBox.getChildren().add(noSegs);
            return;
        }

        for (DownloadSegment seg : segments) {
            HBox row = new HBox(8);
            row.setAlignment(Pos.CENTER_LEFT);

            Label segIdx = new Label(String.format("#%d", seg.index() + 1));
            segIdx.setPrefWidth(30);
            segIdx.setStyle("-fx-text-fill: #38BDF8; -fx-font-weight: bold; -fx-font-size: 11px;");

            Region segTrack = new Region();
            segTrack.setStyle("-fx-background-color: rgba(255,255,255,0.08); -fx-background-radius: 4; -fx-min-height: 8;");
            HBox.setHgrow(segTrack, Priority.ALWAYS);

            Region segFill = new Region();
            segFill.setStyle("-fx-background-color: linear-gradient(to right, #38BDF8, #818CF8); -fx-background-radius: 4; -fx-min-height: 8;");
            segFill.setMinWidth(Region.USE_PREF_SIZE);
            segFill.setMaxWidth(Region.USE_PREF_SIZE);

            long segCurrent = seg.downloadedBytes();
            long segTotal = seg.totalBytes();
            double segPct = (segTotal > 0) ? Math.min(1.0, (double) segCurrent / segTotal) : 0;

            StackPane segWrap = new StackPane();
            segWrap.setAlignment(Pos.CENTER_LEFT);
            segWrap.getChildren().addAll(segTrack, segFill);
            HBox.setHgrow(segWrap, Priority.ALWAYS);

            segWrap.widthProperty().addListener((obs, oldW, newW) -> {
                if (newW != null && newW.doubleValue() > 0) {
                    segFill.setPrefWidth(segPct * newW.doubleValue());
                }
            });
            // Initial layout calculation
            segFill.setPrefWidth(0);

            Label segBytes = new Label(formatBytes(segCurrent));
            segBytes.setPrefWidth(80);
            segBytes.setAlignment(Pos.CENTER_RIGHT);
            segBytes.setStyle("-fx-text-fill: #CBD5E1; -fx-font-size: 11px; -fx-font-family: 'JetBrains Mono', monospace;");

            row.getChildren().addAll(segIdx, segWrap, segBytes);
            segmentsBox.getChildren().add(row);
        }
    }

    private void toggleDetails() {
        detailsVisible = !detailsVisible;
        segmentsScrollPane.setVisible(detailsVisible);
        segmentsScrollPane.setManaged(detailsVisible);
        detailsBtn.setText(detailsVisible ? "Hide details" : "Show details");
        if (detailsVisible) {
            setHeight(getHeight() + 150);
        } else {
            setHeight(getHeight() - 150);
        }
    }

    private Label createTabLabel(String text, boolean active) {
        Label lbl = new Label(text);
        lbl.getStyleClass().add("tab-label");
        if (active) {
            lbl.getStyleClass().add("active");
            lbl.setStyle("-fx-text-fill: #38BDF8; -fx-border-color: #38BDF8; -fx-border-width: 0 0 2 0; -fx-padding: 4 8;");
        } else {
            lbl.setStyle("-fx-text-fill: #94A3B8; -fx-padding: 4 8;");
        }
        return lbl;
    }

    private void switchTab(Label activeTab, Label inactive1, Label inactive2, VBox activeContent) {
        activeTab.setStyle("-fx-text-fill: #38BDF8; -fx-border-color: #38BDF8; -fx-border-width: 0 0 2 0; -fx-padding: 4 8;");
        inactive1.setStyle("-fx-text-fill: #94A3B8; -fx-padding: 4 8;");
        inactive2.setStyle("-fx-text-fill: #94A3B8; -fx-padding: 4 8;");

        statusTabContent.setVisible(activeContent == statusTabContent);
        statusTabContent.setManaged(activeContent == statusTabContent);

        speedTabContent.setVisible(activeContent == speedTabContent);
        speedTabContent.setManaged(activeContent == speedTabContent);

        completionTabContent.setVisible(activeContent == completionTabContent);
        completionTabContent.setManaged(activeContent == completionTabContent);
    }

    private void updateSpeedLimitText(long kbps) {
        if (kbps >= 1024) {
            speedLimitValLabel.setText(String.format("Limit: %.2f MB/s", kbps / 1024.0));
        } else {
            speedLimitValLabel.setText(String.format("Limit: %d KB/s", kbps));
        }
    }

    private VBox createFieldBox(String title, Label valueLabel) {
        Label t = new Label(title);
        t.setStyle("-fx-text-fill: #64748B; -fx-font-size: 11px;");
        return new VBox(2, t, valueLabel);
    }

    private Label createValueLabel(String initialText) {
        Label v = new Label(initialText);
        v.setStyle("-fx-text-fill: #F8FAFC; -fx-font-family: 'JetBrains Mono', monospace; -fx-font-size: 12px; -fx-font-weight: bold;");
        return v;
    }

    private String extractHost(String url) {
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            return host != null ? host : "Unknown";
        } catch (Exception e) {
            return "Unknown";
        }
    }

    private String formatBytes(long bytes) {
        if (bytes < 0) return "Unknown";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.2f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.2f MB", bytes / (1024.0 * 1024.0));
        return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    private void openCompletedFile(Download d) {
        File file = d.destination().value().toFile();
        if (file.exists()) {
            java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    String os = System.getProperty("os.name", "").toLowerCase();
                    if (os.contains("win")) {
                        new ProcessBuilder("explorer.exe", file.getAbsolutePath()).start();
                    } else {
                        new ProcessBuilder("xdg-open", file.getAbsolutePath()).start();
                    }
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            });
        }
    }

    private void handleCompletionAction(Download d) {
        String action = onCompletionCombo.getValue();
        if (action == null || "Do nothing".equals(action)) return;

        if ("Open downloaded file".equals(action)) {
            openCompletedFile(d);
        } else if ("Open destination folder".equals(action)) {
            File folder = d.destination().value().getParent().toFile();
            java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    String os = System.getProperty("os.name", "").toLowerCase();
                    if (os.contains("win")) {
                        new ProcessBuilder("explorer.exe", folder.getAbsolutePath()).start();
                    } else {
                        new ProcessBuilder("xdg-open", folder.getAbsolutePath()).start();
                    }
                } catch (Exception ex) {
                    ex.printStackTrace();
                }
            });
        }
    }
}

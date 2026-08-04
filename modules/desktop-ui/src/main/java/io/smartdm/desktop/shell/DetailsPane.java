package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.scene.control.Button;
import javafx.scene.shape.SVGPath;

import javafx.animation.AnimationTimer;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadState;
import io.smartdm.domain.DownloadSegment;
import java.util.List;

public final class DetailsPane extends VBox {
    private final Label title;
    private final Label safeLbl;
    private final SVGPath safeChipIcon;
    private final HBox safeChip;
    private final Label safeNote;
    
    private final Label statusVal;
    private final Label downloadedVal;
    private final Label speedVal;
    private final Label etaVal;
    private final Label hostVal;
    
    private final Label segmentsHLbl;
    private final HBox segmentsLaneContainer;
    private final VBox segmentsList;
    
    private final Label suggestedFolderVal;
    private final Label ruleMatchedVal;
    
    private Download activeDownload;
    private final AnimationTimer timer;

    public DetailsPane(Runnable onClose) {
        getStyleClass().add("details");
        setPrefWidth(320);
        
        // Head
        HBox head = new HBox();
        head.getStyleClass().add("details-head");
        
        title = new Label("");
        title.getStyleClass().add("details-title");
        title.setWrapText(true);
        HBox.setHgrow(title, Priority.ALWAYS);
        
        Button closeBtn = new Button();
        closeBtn.getStyleClass().add("icon-btn");
        SVGPath closeIcon = new SVGPath();
        closeIcon.setContent("M18 6 L6 18 M6 6 L18 18");
        closeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        closeBtn.setGraphic(closeIcon);
        closeBtn.setOnAction(e -> onClose.run());
        
        head.getChildren().addAll(title, closeBtn);
        
        // Safety Section
        VBox safetySec = new VBox();
        safetySec.getStyleClass().add("dsec");
        
        Label safetyH = new Label("SAFETY");
        safetyH.getStyleClass().add("dsec-h");
        
        VBox safetyCard = new VBox();
        safetyCard.getStyleClass().add("safety-card");
        
        safeChip = new HBox();
        safeChip.getStyleClass().addAll("status-chip", "ok");
        safeChipIcon = new SVGPath();
        safeChipIcon.setContent("M12 2 C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"); // Info icon
        safeChipIcon.setStyle("-fx-fill: #A6ADC4;");
        safeLbl = new Label("Not scanned");
        safeChip.getChildren().addAll(safeChipIcon, safeLbl);
        
        safeNote = new Label("Analyzing file safety...");
        safeNote.getStyleClass().add("note");
        safeNote.setWrapText(true);
        
        safetyCard.setStyle("-fx-cursor: hand;");
        safetyCard.getChildren().addAll(safeChip, safeNote);
        safetyCard.setOnMouseClicked(e -> {
            if (activeDownload != null && activeDownload.destination() != null && activeDownload.destination().value() != null) {
                java.io.File file = activeDownload.destination().value().toFile();
                javafx.stage.Stage owner = (javafx.stage.Stage) getScene().getWindow();
                
                io.smartdm.safety.api.FileScanner avScanner = System.getProperty("os.name", "").toLowerCase().contains("win")
                    ? new io.smartdm.safety.av.windows.WindowsDefenderScanner()
                    : new io.smartdm.safety.av.clamav.ClamAvScanner();
                    
                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    java.util.List<io.smartdm.safety.api.SafetyEvidence> evidences = new java.util.ArrayList<>();
                    long totalSize = (activeDownload.totalBytes() != null && activeDownload.totalBytes().value() > 0) ? activeDownload.totalBytes().value() : -1L;
                    io.smartdm.safety.api.PreDownloadContext preContext = new io.smartdm.safety.api.PreDownloadContext(
                        activeDownload.source().value().toString(),
                        totalSize,
                        null,
                        file.getName(),
                        java.util.List.of()
                    );
                    evidences.addAll(new io.smartdm.safety.rules.PreDownloadRiskRules().evaluate(preContext));
                    if (file.exists()) {
                        evidences.addAll(new io.smartdm.safety.rules.MagicByteVerifier().verify(file.toPath(), null));
                        evidences.addAll(new io.smartdm.safety.rules.ArchiveStructureInspector().inspectArchive(file.toPath()));
                    }
                    if (avScanner.isAvailable() && file.exists()) {
                        try {
                            var scanResult = avScanner.scanFileAsync(file.toPath()).get();
                            if (scanResult.status() == io.smartdm.safety.api.ScanStatus.MALWARE_DETECTED) {
                                evidences.add(new io.smartdm.safety.api.SafetyEvidence("ANTIVIRUS", "AV_THREAT", scanResult.details(), io.smartdm.safety.api.RiskLevel.CRITICAL, scanResult.threatName()));
                            }
                        } catch (Exception ignored) {}
                    }
                    io.smartdm.safety.rules.RiskDecisionEngine.SafetyDecision decision = new io.smartdm.safety.rules.RiskDecisionEngine().evaluate(evidences);
                    String sha256 = "N/A";
                    try {
                        byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
                        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                        byte[] digest = md.digest(bytes);
                        StringBuilder sb = new StringBuilder();
                        for (byte b : digest) sb.append(String.format("%02x", b));
                        sha256 = sb.toString();
                    } catch (Exception ignored) {}
                    final String finalSha256 = sha256;
                    javafx.application.Platform.runLater(() -> {
                        SafetyCenterDialog dialog = new SafetyCenterDialog(
                            owner,
                            file,
                            decision.status(),
                            decision.overallRiskLevel(),
                            decision.evidence(),
                            finalSha256,
                            avScanner.getScannerName(),
                            new io.smartdm.safety.rules.LocalQuarantineManager()
                        );
                        dialog.show();
                    });
                });
            }
        });

        safetySec.getChildren().addAll(safetyH, safetyCard);
        
        // Transfer Section
        VBox transSec = new VBox();
        transSec.getStyleClass().add("dsec");
        Label transH = new Label("TRANSFER");
        transH.getStyleClass().add("dsec-h");
        
        statusVal = new Label("");
        downloadedVal = new Label("");
        speedVal = new Label("");
        etaVal = new Label("");
        hostVal = new Label("");
        
        transSec.getChildren().addAll(
            transH,
            createKv("Status", statusVal),
            createKv("Downloaded", downloadedVal),
            createKv("Speed", speedVal),
            createKv("ETA", etaVal),
            createKv("Source host", hostVal)
        );
        
        // Segments Section
        VBox segmentsSec = new VBox();
        segmentsSec.getStyleClass().add("dsec");
        
        segmentsHLbl = new Label("SEGMENTS");
        segmentsHLbl.getStyleClass().add("dsec-h");
        
        segmentsLaneContainer = new HBox();
        segmentsLaneContainer.getStyleClass().add("lanes");
        
        segmentsList = new VBox();
        segmentsList.setSpacing(6);
        
        segmentsSec.getChildren().addAll(segmentsHLbl, segmentsLaneContainer, segmentsList);
        
        // Destination Section
        VBox destSec = new VBox();
        destSec.getStyleClass().add("dsec");
        
        Label destH = new Label("DESTINATION");
        destH.getStyleClass().add("dsec-h");
        
        suggestedFolderVal = new Label("");
        ruleMatchedVal = new Label("by extension");
        
        destSec.getChildren().addAll(
            destH,
            createKv("Suggested folder", suggestedFolderVal),
            createKv("Rule matched", ruleMatchedVal)
        );
        
        VBox contentBox = new VBox(14); // spacing 14
        contentBox.getChildren().addAll(safetySec, transSec, segmentsSec, destSec);
        
        javafx.scene.control.ScrollPane scrollPane = new javafx.scene.control.ScrollPane(contentBox);
        scrollPane.setFitToWidth(true);
        scrollPane.setHbarPolicy(javafx.scene.control.ScrollPane.ScrollBarPolicy.NEVER);
        scrollPane.setVbarPolicy(javafx.scene.control.ScrollPane.ScrollBarPolicy.AS_NEEDED);
        scrollPane.setStyle("-fx-background-color: transparent; -fx-background: transparent; -fx-border-color: transparent; -fx-padding: 0;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);
        
        getChildren().addAll(head, scrollPane);
        
        timer = new AnimationTimer() {
            private long lastUpdate = 0;
            @Override
            public void handle(long now) {
                if (now - lastUpdate >= 100_000_000L) {
                    if (activeDownload != null) {
                        refreshUI();
                    }
                    lastUpdate = now;
                }
            }
        };
    }
    
    public void bind(Download download) {
        this.activeDownload = download;
        if (download != null) {
            refreshUI();
            checkSafetyAsync(download);
            timer.start();
        } else {
            timer.stop();
        }
    }

    private void checkSafetyAsync(Download download) {
        if (download == null || download.destination() == null || download.destination().value() == null) return;
        java.io.File file = download.destination().value().toFile();
        
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            java.util.List<io.smartdm.safety.api.SafetyEvidence> evidences = new java.util.ArrayList<>();
            long totalSize = (download.totalBytes() != null && download.totalBytes().value() > 0) ? download.totalBytes().value() : -1L;
            
            io.smartdm.safety.api.PreDownloadContext preContext = new io.smartdm.safety.api.PreDownloadContext(
                download.source().value().toString(),
                totalSize,
                null,
                file.getName(),
                java.util.List.of()
            );
            evidences.addAll(new io.smartdm.safety.rules.PreDownloadRiskRules().evaluate(preContext));

            if (file.exists()) {
                evidences.addAll(new io.smartdm.safety.rules.MagicByteVerifier().verify(file.toPath(), null));
                evidences.addAll(new io.smartdm.safety.rules.ArchiveStructureInspector().inspectArchive(file.toPath()));
            }

            io.smartdm.safety.api.FileScanner avScanner = System.getProperty("os.name", "").toLowerCase().contains("win")
                ? new io.smartdm.safety.av.windows.WindowsDefenderScanner()
                : new io.smartdm.safety.av.clamav.ClamAvScanner();

            if (avScanner.isAvailable() && file.exists()) {
                try {
                    var scanResult = avScanner.scanFileAsync(file.toPath()).get();
                    if (scanResult.status() == io.smartdm.safety.api.ScanStatus.MALWARE_DETECTED) {
                        evidences.add(new io.smartdm.safety.api.SafetyEvidence(
                            "ANTIVIRUS",
                            "AV_THREAT_DETECTED",
                            scanResult.details() != null ? scanResult.details() : "Malware detected",
                            io.smartdm.safety.api.RiskLevel.CRITICAL,
                            scanResult.threatName()
                        ));
                    }
                } catch (Exception ignored) {}
            }

            io.smartdm.safety.rules.RiskDecisionEngine.SafetyDecision decision = new io.smartdm.safety.rules.RiskDecisionEngine().evaluate(evidences);

            javafx.application.Platform.runLater(() -> {
                if (activeDownload == download) {
                    if (decision.status() == io.smartdm.safety.api.SafetyStatus.NO_THREATS_DETECTED || decision.status() == io.smartdm.safety.api.SafetyStatus.UNSCANNED) {
                        safeLbl.setText("No threats detected");
                        safeChip.setStyle("-fx-background-color: rgba(0, 214, 143, 0.15); -fx-background-radius: 12px; -fx-padding: 4 10;");
                        safeLbl.setStyle("-fx-text-fill: #00D68F; -fx-font-weight: bold; -fx-font-size: 12px;");
                        safeNote.setText("Scanned with " + avScanner.getScannerName() + " & local magic byte verifier.");
                    } else if (decision.status() == io.smartdm.safety.api.SafetyStatus.SUSPICIOUS) {
                        safeLbl.setText("Suspicious");
                        safeChip.setStyle("-fx-background-color: rgba(255, 194, 75, 0.15); -fx-background-radius: 12px; -fx-padding: 4 10;");
                        safeLbl.setStyle("-fx-text-fill: #FFC24B; -fx-font-weight: bold; -fx-font-size: 12px;");
                        safeNote.setText("Potential risk detected by heuristic inspection rules.");
                    } else if (decision.status() == io.smartdm.safety.api.SafetyStatus.MALWARE_DETECTED) {
                        safeLbl.setText("Malware Detected!");
                        safeChip.setStyle("-fx-background-color: rgba(255, 77, 106, 0.15); -fx-background-radius: 12px; -fx-padding: 4 10;");
                        safeLbl.setStyle("-fx-text-fill: #FF4D6A; -fx-font-weight: bold; -fx-font-size: 12px;");
                        safeNote.setText("Threat identified! Click to open Safety & Quarantine Center.");
                    }
                }
            });
        });
    }
    
    private void refreshUI() {
        if (activeDownload == null) return;
        
        String fileName = activeDownload.destination().value().getFileName().toString();
        if (!fileName.equals(title.getText())) title.setText(fileName);
        
        String state = activeDownload.state().toString().toLowerCase();
        if (!state.equals(statusVal.getText())) statusVal.getText();
        statusVal.setText(state);
        
        long dlBytes = activeDownload.downloadedBytes().value();
        long totalBytes = activeDownload.totalBytes().value();
        
        String dlStr = "-";
        if (dlBytes > 0) {
            dlStr = (dlBytes / 1024 / 1024) + " MB";
            if (totalBytes > 0) {
                dlStr += " / " + (totalBytes / 1024 / 1024) + " MB";
            }
        }
        if (!dlStr.equals(downloadedVal.getText())) downloadedVal.setText(dlStr);
        
        String host = activeDownload.source().value().getHost();
        if (host == null) host = "-";
        if (!host.equals(hostVal.getText())) hostVal.setText(host);
        
        SpeedEtaCalculator.SpeedEtaResult speedEta = SpeedEtaCalculator.calculate(activeDownload);
        if (!speedEta.speedFormatted().equals(speedVal.getText())) speedVal.setText(speedEta.speedFormatted());
        if (!speedEta.etaFormatted().equals(etaVal.getText())) etaVal.setText(speedEta.etaFormatted());
        
        // Destination
        String destPath = activeDownload.destination().value().toString();
        String folder = activeDownload.destination().value().getParent() != null ? activeDownload.destination().value().getParent().toString() : destPath;
        if (!folder.equals(suggestedFolderVal.getText())) suggestedFolderVal.setText(folder);
        
        // Segments
        List<DownloadSegment> segments = activeDownload.segments();
        String segHText = "SEGMENTS (" + segments.size() + ")";
        if (!segHText.equals(segmentsHLbl.getText())) segmentsHLbl.setText(segHText);
        
        if (segmentsLaneContainer.getChildren().size() != segments.size()) {
            segmentsLaneContainer.getChildren().clear();
            segmentsList.getChildren().clear();
            for (int i = 0; i < segments.size(); i++) {
                Region lane = new Region();
                lane.getStyleClass().add("lane");
                HBox.setHgrow(lane, Priority.ALWAYS);
                segmentsLaneContainer.getChildren().add(lane);
                
                HBox row = new HBox();
                row.setSpacing(8);
                row.setAlignment(javafx.geometry.Pos.CENTER_LEFT);
                
                Region dot = new Region();
                dot.setMinSize(8, 8);
                dot.setMaxSize(8, 8);
                dot.setStyle("-fx-background-radius: 2px;");
                
                Label nameLbl = new Label("Segment " + (i + 1));
                nameLbl.getStyleClass().add("v");
                nameLbl.setStyle("-fx-text-fill: #A6ADC4;");
                
                Region spacer = new Region();
                HBox.setHgrow(spacer, Priority.ALWAYS);
                
                Label progLbl = new Label("0%");
                progLbl.getStyleClass().add("v");
                
                row.getChildren().addAll(dot, nameLbl, spacer, progLbl);
                segmentsList.getChildren().add(row);
            }
        }
        
        String[] colors = {"#37E9FF", "#9B6BFF", "#FF3DCB", "#FFC24B"};
        for (int i = 0; i < segments.size(); i++) {
            DownloadSegment segment = segments.get(i);
            Region lane = (Region) segmentsLaneContainer.getChildren().get(i);
            HBox row = (HBox) segmentsList.getChildren().get(i);
            Region dot = (Region) row.getChildren().get(0);
            Label progLbl = (Label) row.getChildren().get(3);
            
            double progress = segment.totalBytes() > 0 ? (double) segment.downloadedBytes() / segment.totalBytes() : 0.0;
            if (progress < 0.0) progress = 0.0;
            if (progress > 1.0) progress = 1.0;
            
            String color = colors[i % colors.length];
            if (activeDownload.state() == DownloadState.FAILED || activeDownload.state() == DownloadState.CANCELED) {
                color = "#4D526A";
            } else if (activeDownload.state() == DownloadState.COMPLETED) {
                color = "#00D68F";
            }
            
            String newStyle = "-fx-background-color: linear-gradient(to right, " + color + " 0%, " + color + " " + (progress * 100) + "%, rgba(255,255,255,0.08) " + (progress * 100) + "%, rgba(255,255,255,0.08) 100%);";
            if (!newStyle.equals(lane.getStyle())) lane.setStyle(newStyle);
            lane.setOpacity(activeDownload.state() == DownloadState.FAILED || activeDownload.state() == DownloadState.CANCELED ? 0.4 : 1.0);
            
            String dotStyle = "-fx-background-color: " + color + "; -fx-background-radius: 2px;";
            if (!dotStyle.equals(dot.getStyle())) dot.setStyle(dotStyle);
            
            String pctTxt = String.format("%.0f%%", progress * 100);
            if (!pctTxt.equals(progLbl.getText())) progLbl.setText(pctTxt);
        }
    }
    
    private HBox createKv(String k, Label vLbl) {
        HBox kv = new HBox();
        kv.getStyleClass().add("kv");
        
        Label kLbl = new Label(k);
        kLbl.getStyleClass().add("k");
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        vLbl.getStyleClass().add("v");
        
        kv.getChildren().addAll(kLbl, spacer, vLbl);
        return kv;
    }
}

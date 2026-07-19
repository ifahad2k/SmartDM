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
        safeChipIcon.setContent("M20 6 L9 17 L4 12");
        safeChipIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
        safeLbl = new Label("No threats detected");
        safeChip.getChildren().addAll(safeChipIcon, safeLbl);
        
        Label safeNote = new Label("Local scanners found no known threats. This is not a guarantee of safety.");
        safeNote.getStyleClass().add("note");
        safeNote.setWrapText(true);
        
        safetyCard.getChildren().addAll(safeChip, safeNote);
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
            timer.start();
        } else {
            timer.stop();
        }
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
        
        if (!"-".equals(speedVal.getText())) speedVal.setText("-");
        if (!"-".equals(etaVal.getText())) etaVal.setText("-");
        
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

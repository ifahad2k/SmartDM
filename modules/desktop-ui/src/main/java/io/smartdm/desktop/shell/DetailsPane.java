package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.scene.control.Button;
import javafx.scene.shape.SVGPath;

public final class DetailsPane extends VBox {
    public DetailsPane() {
        getStyleClass().add("details");
        setPrefWidth(320);
        
        // Head
        HBox head = new HBox();
        head.getStyleClass().add("details-head");
        
        Label title = new Label("Podcast-Ep114-Master.mp3");
        title.getStyleClass().add("details-title");
        title.setWrapText(true);
        HBox.setHgrow(title, Priority.ALWAYS);
        
        Button closeBtn = new Button();
        closeBtn.getStyleClass().add("icon-btn");
        SVGPath closeIcon = new SVGPath();
        closeIcon.setContent("M18 6 L6 18 M6 6 L18 18");
        closeIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        closeBtn.setGraphic(closeIcon);
        
        head.getChildren().addAll(title, closeBtn);
        
        // Safety Section
        VBox safetySec = new VBox();
        safetySec.getStyleClass().add("dsec");
        
        Label safetyH = new Label("SAFETY");
        safetyH.getStyleClass().add("dsec-h");
        
        VBox safetyCard = new VBox();
        safetyCard.getStyleClass().add("safety-card");
        
        HBox safeChip = new HBox();
        safeChip.getStyleClass().addAll("status-chip", "ok");
        SVGPath safeChipIcon = new SVGPath();
        safeChipIcon.setContent("M20 6 L9 17 L4 12");
        safeChipIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2.4; -fx-fill: transparent;");
        Label safeLbl = new Label("No threats detected");
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
        
        transSec.getChildren().addAll(
            transH,
            createKv("Status", "paused"),
            createKv("Downloaded", "96 MB"),
            createKv("Speed", "3.2 MB/s"),
            createKv("ETA", "2:10"),
            createKv("Source host", "cdn.podhost.io")
        );
        
        getChildren().addAll(head, safetySec, transSec);
    }
    
    private HBox createKv(String k, String v) {
        HBox kv = new HBox();
        kv.getStyleClass().add("kv");
        
        Label kLbl = new Label(k);
        kLbl.getStyleClass().add("k");
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        Label vLbl = new Label(v);
        vLbl.getStyleClass().add("v");
        
        kv.getChildren().addAll(kLbl, spacer, vLbl);
        return kv;
    }
}

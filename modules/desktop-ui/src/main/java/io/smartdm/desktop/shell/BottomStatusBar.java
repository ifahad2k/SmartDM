package io.smartdm.desktop.shell;

import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.geometry.Pos;
import javafx.scene.shape.SVGPath;

public final class BottomStatusBar extends HBox {
    public BottomStatusBar() {
        getStyleClass().add("statusbar");

        // Online Status
        HBox onlineStatus = new HBox();
        onlineStatus.getStyleClass().add("sb-item");
        Region dot = new Region();
        dot.getStyleClass().add("sb-dot");
        Label onlineLabel = new Label("Online");
        onlineLabel.getStyleClass().add("sb-item-strong");
        onlineStatus.getChildren().addAll(dot, onlineLabel);

        // Download Speed
        HBox dlSpeed = new HBox();
        dlSpeed.getStyleClass().add("sb-item");
        SVGPath dlIcon = new SVGPath();
        dlIcon.setContent("M19 12 L12 19 L5 12 M12 19 L12 5");
        dlIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        Label dlLabel = new Label("18.4 MB/s");
        dlLabel.getStyleClass().add("sb-item-strong");
        dlSpeed.getChildren().addAll(dlIcon, dlLabel);

        // Upload Speed
        HBox ulSpeed = new HBox();
        ulSpeed.getStyleClass().add("sb-item");
        SVGPath ulIcon = new SVGPath();
        ulIcon.setContent("M5 12 L12 5 L19 12 M12 5 L12 19");
        ulIcon.setStyle("-fx-stroke: #A6ADC4; -fx-stroke-width: 2; -fx-fill: transparent;");
        Label ulLabel = new Label("0.1 MB/s");
        ulLabel.getStyleClass().add("sb-item-strong");
        ulSpeed.getChildren().addAll(ulIcon, ulLabel);
        
        // Active/Queued
        HBox activeStatus = new HBox();
        activeStatus.getStyleClass().add("sb-item");
        Label activeCount = new Label("3");
        activeCount.getStyleClass().add("sb-item-strong");
        Label activeTxt = new Label(" active · ");
        Label queuedCount = new Label("1");
        queuedCount.getStyleClass().add("sb-item-strong");
        Label queuedTxt = new Label(" queued");
        activeStatus.getChildren().addAll(activeCount, activeTxt, queuedCount, queuedTxt);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label potatoMode = new Label("Potato mode: off");
        potatoMode.getStyleClass().add("sb-item");
        
        Label geminiStatus = new Label("Gemini: disabled");
        geminiStatus.getStyleClass().add("sb-item");

        getChildren().addAll(onlineStatus, dlSpeed, ulSpeed, activeStatus, spacer, potatoMode, geminiStatus);
    }
}

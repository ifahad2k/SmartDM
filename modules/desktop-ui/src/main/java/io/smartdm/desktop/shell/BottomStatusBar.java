package io.smartdm.desktop.shell;

import javafx.scene.layout.HBox;
import javafx.scene.control.Label;
import javafx.geometry.Pos;
import javafx.geometry.Insets;

public final class BottomStatusBar extends HBox {
    public BottomStatusBar() {
        setSpacing(16);
        setAlignment(Pos.CENTER_LEFT);
        setPadding(new Insets(4, 16, 4, 16));
        getStyleClass().add("bottom-status-bar");
        setStyle("-fx-background-color: -fx-color-surface-sunken; -fx-border-color: -fx-color-border; -fx-border-width: 1 0 0 0; -fx-font-size: 12px;");

        Label statusLabel = new Label("Ready");
        
        getChildren().addAll(statusLabel);
    }
}

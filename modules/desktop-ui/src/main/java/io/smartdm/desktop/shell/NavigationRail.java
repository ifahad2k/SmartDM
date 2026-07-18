package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.control.Button;
import javafx.geometry.Pos;
import javafx.geometry.Insets;

public final class NavigationRail extends VBox {
    public NavigationRail() {
        setSpacing(16);
        setAlignment(Pos.TOP_CENTER);
        setPadding(new Insets(16, 8, 16, 8));
        getStyleClass().add("navigation-rail");
        setStyle("-fx-background-color: -fx-color-surface-dim; -fx-pref-width: 72px;");

        Button transfersBtn = new Button("Transfers");
        Button queueBtn = new Button("Queue");
        Button catalogBtn = new Button("Catalog");
        Button settingsBtn = new Button("Settings");

        getChildren().addAll(transfersBtn, queueBtn, catalogBtn, settingsBtn);
    }
}

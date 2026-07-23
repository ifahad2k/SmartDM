package io.smartdm.desktop.shell;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import java.util.Objects;

public abstract class GlassmorphicDialog extends Stage {
    private double xOffset = 0;
    private double yOffset = 0;

    protected final BorderPane root;
    protected final VBox dialogBody;

    @SuppressWarnings("this-escape")
    public GlassmorphicDialog(Stage owner, String title) {
        this(owner, title, Modality.APPLICATION_MODAL);
    }

    @SuppressWarnings("this-escape")
    public GlassmorphicDialog(Stage owner, String title, Modality modality) {
        initOwner(owner);
        if (modality != null) {
            initModality(modality);
        }
        initStyle(StageStyle.TRANSPARENT); // Undecorated and transparent for drop shadow

        root = new BorderPane();
        root.getStyleClass().add("os-window");

        // Custom Title Bar
        HBox titleBar = new HBox();
        titleBar.getStyleClass().add("titlebar");
        
        Region appIcon = new Region();
        appIcon.getStyleClass().add("app-icon");
        
        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("app-title");
        titleLabel.setMaxWidth(500);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        // Window Controls
        HBox winCaption = new HBox();
        winCaption.getStyleClass().add("win-caption");
        
        javafx.scene.layout.StackPane closeBtn = new javafx.scene.layout.StackPane();
        closeBtn.getStyleClass().addAll("cap-btn", "close");
        closeBtn.setOnMouseClicked(e -> close());
        
        Label closeIcon = new Label("✕");
        closeIcon.getStyleClass().add("close-icon-text");
        closeBtn.getChildren().add(closeIcon);
        
        javafx.scene.layout.StackPane minBtn = new javafx.scene.layout.StackPane();
        minBtn.getStyleClass().addAll("cap-btn", "minimize");
        minBtn.setOnMouseClicked(e -> setIconified(true));
        
        Label minIcon = new Label("−");
        minIcon.getStyleClass().add("min-icon-text");
        minBtn.getChildren().add(minIcon);
        
        winCaption.getChildren().addAll(minBtn, closeBtn);
        
        titleBar.getChildren().addAll(appIcon, titleLabel, spacer, winCaption);
        
        // Make the window draggable via the title bar
        titleBar.setOnMousePressed(event -> {
            xOffset = event.getSceneX();
            yOffset = event.getSceneY();
        });
        titleBar.setOnMouseDragged(event -> {
            setX(event.getScreenX() - xOffset);
            setY(event.getScreenY() - yOffset);
        });

        root.setTop(titleBar);
        
        dialogBody = new VBox();
        dialogBody.getStyleClass().add("dialog-body");
        root.setCenter(dialogBody);

        Scene scene = new Scene(root);
        scene.setFill(Color.TRANSPARENT);
        scene.getStylesheets().add(Objects.requireNonNull(
            getClass().getResource("/io/smartdm/desktop/theme/dialog.css")
        ).toExternalForm());
        
        setScene(scene);
    }
}

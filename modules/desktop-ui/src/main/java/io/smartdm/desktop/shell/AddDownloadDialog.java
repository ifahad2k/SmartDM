package io.smartdm.desktop.shell;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

public final class AddDownloadDialog extends GlassmorphicDialog {
    
    private final TextField urlField;
    private final TextField destinationField;
    private final ComboBox<String> categoryCombo;
    private final Button downloadBtn;
    
    public AddDownloadDialog(Stage owner) {
        super(owner, "SmartDM — New Download");
        
        // Header
        Label headerTitle = new Label("Add a new download");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("Paste a link and SmartDM will inspect it before anything is written to disk.");
        headerSub.getStyleClass().add("ds");
        VBox head = new VBox(2, headerTitle, headerSub);
        
        // File URL field
        Label urlLabel = new Label("FILE URL");
        urlLabel.getStyleClass().add("field-label");
        
        urlField = new TextField("https://download.blender.org/release/Blender...");
        urlField.getStyleClass().add("text-input");
        HBox.setHgrow(urlField, Priority.ALWAYS);
        
        HBox urlRow = new HBox(8, urlField);
        VBox urlGroup = new VBox(6, urlLabel, urlRow);
        
        // Save to field
        Label destLabel = new Label("SAVE TO");
        destLabel.getStyleClass().add("field-label");
        
        destinationField = new TextField("~/Downloads/Software");
        destinationField.getStyleClass().add("text-input");
        HBox.setHgrow(destinationField, Priority.ALWAYS);
        VBox destGroup = new VBox(6, destLabel, destinationField);
        HBox.setHgrow(destGroup, Priority.ALWAYS);
        
        // Category
        Label catLabel = new Label("CATEGORY");
        catLabel.getStyleClass().add("field-label");
        categoryCombo = new ComboBox<>();
        categoryCombo.getItems().addAll("Compressed", "Programs", "Documents", "Video", "Music");
        categoryCombo.getSelectionModel().select(0);
        categoryCombo.getStyleClass().add("text-input");
        categoryCombo.setMaxWidth(Double.MAX_VALUE);
        VBox catGroup = new VBox(6, catLabel, categoryCombo);
        HBox.setHgrow(catGroup, Priority.ALWAYS);
        
        HBox row2 = new HBox(12, destGroup, catGroup);
        
        dialogBody.getChildren().addAll(head, urlGroup, row2);
        
        // Footer
        HBox footer = new HBox();
        footer.getStyleClass().add("dialog-foot");
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());
        
        Button queueBtn = new Button("Add to queue");
        queueBtn.getStyleClass().add("btn");
        
        downloadBtn = new Button("Download now");
        downloadBtn.getStyleClass().addAll("btn", "btn-primary");
        
        footer.getChildren().addAll(spacer, cancelBtn, queueBtn, downloadBtn);
        root.setBottom(footer);
    }
}

package io.smartdm.desktop.shell;

import io.smartdm.domain.organization.FolderSuggestion;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.nio.file.Path;
import java.util.List;
import java.util.function.Consumer;

@SuppressWarnings({"deprecation", "unchecked", "this-escape"})
public class FolderSuggestionPanel extends VBox {

    private final Consumer<Path> onFolderSelected;

    public FolderSuggestionPanel(Consumer<Path> onFolderSelected) {
        this.onFolderSelected = onFolderSelected;
        setSpacing(6);
        setStyle("-fx-padding: 8px 0;");
    }

    public void setSuggestions(List<FolderSuggestion> suggestions) {
        getChildren().clear();
        if (suggestions == null || suggestions.isEmpty()) return;

        Label title = new Label("✨ Smart Destination Suggestions:");
        title.setStyle("-fx-font-size: 11px; -fx-font-weight: bold; -fx-text-fill: #9CA3AF;");
        getChildren().add(title);

        HBox chipContainer = new HBox(8);
        chipContainer.setAlignment(Pos.CENTER_LEFT);

        for (FolderSuggestion sug : suggestions) {
            Button chip = new Button("📁 " + sug.displayName());
            chip.getStyleClass().add("btn");

            String style = "-fx-background-color: rgba(255, 255, 255, 0.08); -fx-border-color: rgba(255, 255, 255, 0.15); -fx-border-radius: 6px; -fx-background-radius: 6px; -fx-text-fill: #F3F4F6; -fx-font-size: 11px; -fx-cursor: hand;";
            if (sug.containsDuplicate()) {
                style = "-fx-background-color: rgba(245, 158, 11, 0.15); -fx-border-color: #F59E0B; -fx-border-radius: 6px; -fx-background-radius: 6px; -fx-text-fill: #FDE68A; -fx-font-size: 11px; -fx-cursor: hand;";
            }
            chip.setStyle(style);

            if (sug.reason() != null && !sug.reason().isBlank()) {
                Tooltip tooltip = new Tooltip(sug.reason() + " (Score: " + String.format("%.1f", sug.score()) + ")");
                chip.setTooltip(tooltip);
            }

            chip.setOnAction(e -> {
                if (onFolderSelected != null) {
                    onFolderSelected.accept(java.nio.file.Path.of(sug.folderPath()));
                }
            });

            chipContainer.getChildren().add(chip);
        }

        getChildren().add(chipContainer);
    }
}

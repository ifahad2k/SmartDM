package io.smartdm.desktop.shell;

import io.smartdm.catalog.CatalogService;
import io.smartdm.domain.catalog.CatalogDuplicateMatch;
import io.smartdm.domain.catalog.CatalogFile;
import io.smartdm.domain.catalog.CatalogRoot;
import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Path;
import java.util.List;

public class CatalogWorkspace extends VBox {

    private final CatalogService catalogService;
    private final ObservableList<CatalogRoot> rootList = FXCollections.observableArrayList();
    private final ObservableList<CatalogFile> fileList = FXCollections.observableArrayList();

    private final TableView<CatalogRoot> rootTable = new TableView<>();
    private final TableView<CatalogFile> fileTable = new TableView<>();
    private final TextField searchField = new TextField();

    public CatalogWorkspace(CatalogService catalogService) {
        this.catalogService = catalogService;
        getStyleClass().add("workspace");
        setSpacing(16);
        setPadding(new Insets(20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // Header
        VBox headerBox = new VBox(4);
        Label title = new Label("Local File Catalog & Duplicate Center");
        title.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #F3F4F6;");
        Label subtitle = new Label("Index approved local folders and detect duplicates using 3-tier fingerprinting.");
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #9CA3AF;");
        headerBox.getChildren().addAll(title, subtitle);

        // Action Toolbar
        HBox toolbar = new HBox(12);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        Button addFolderBtn = new Button("+ Add Folder to Index");
        addFolderBtn.getStyleClass().add("primary-btn");
        addFolderBtn.setOnAction(e -> handleAddFolder());

        Button checkDupBtn = new Button("🔍 Check File for Duplicates...");
        checkDupBtn.setStyle("-fx-background-color: #374151; -fx-text-fill: #F3F4F6; -fx-font-weight: bold; -fx-cursor: hand;");
        checkDupBtn.setOnAction(e -> handleCheckDuplicate());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        searchField.setPromptText("Search indexed files (FTS5)...");
        searchField.setPrefWidth(260);
        searchField.getStyleClass().add("search-input");
        searchField.textProperty().addListener((obs, old, val) -> handleSearch(val));

        toolbar.getChildren().addAll(addFolderBtn, checkDupBtn, spacer, searchField);

        // Section 1: Approved Catalog Roots Table
        Label rootsHeader = new Label("Approved Catalog Folders");
        rootsHeader.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #E5E7EB;");

        setupRootTable();
        VBox.setVgrow(rootTable, Priority.NEVER);
        rootTable.setPrefHeight(150);

        // Section 2: Indexed Files Table
        Label filesHeader = new Label("Indexed Files & Fingerprints");
        filesHeader.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #E5E7EB;");

        setupFileTable();
        VBox.setVgrow(fileTable, Priority.ALWAYS);

        getChildren().addAll(headerBox, toolbar, rootsHeader, rootTable, filesHeader, fileTable);

        refreshRoots();
    }

    @SuppressWarnings({"deprecation", "unchecked"})
    private void setupRootTable() {
        rootTable.setItems(rootList);
        rootTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);

        TableColumn<CatalogRoot, String> nameCol = new TableColumn<>("Name");
        nameCol.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getDisplayName()));

        TableColumn<CatalogRoot, String> pathCol = new TableColumn<>("Path");
        pathCol.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getPath()));

        TableColumn<CatalogRoot, String> statusCol = new TableColumn<>("Scan Status");
        statusCol.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getScanState()));

        TableColumn<CatalogRoot, Void> actionCol = new TableColumn<>("Action");
        actionCol.setCellFactory(col -> new TableCell<>() {
            private final Button removeBtn = new Button("Remove");
            {
                removeBtn.setStyle("-fx-background-color: #EF4444; -fx-text-fill: white; -fx-font-size: 11px;");
                removeBtn.setOnAction(e -> {
                    CatalogRoot root = getTableView().getItems().get(getIndex());
                    catalogService.removeApprovedRoot(root.getId());
                    refreshRoots();
                });
            }
            @Override
            protected void updateItem(Void item, boolean empty) {
                super.updateItem(item, empty);
                setGraphic(empty ? null : removeBtn);
            }
        });

        rootTable.getColumns().addAll(nameCol, pathCol, statusCol, actionCol);
    }

    @SuppressWarnings({"deprecation", "unchecked"})
    private void setupFileTable() {
        fileTable.setItems(fileList);
        fileTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);

        TableColumn<CatalogFile, String> nameCol = new TableColumn<>("File Name");
        nameCol.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getFileName()));

        TableColumn<CatalogFile, String> sizeCol = new TableColumn<>("Size");
        sizeCol.setCellValueFactory(data -> new SimpleStringProperty(formatSize(data.getValue().getFileSize())));

        TableColumn<CatalogFile, String> pathCol = new TableColumn<>("Relative Path");
        pathCol.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getRelativePath()));

        TableColumn<CatalogFile, String> hashCol = new TableColumn<>("Quick Fingerprint");
        hashCol.setCellValueFactory(data -> new SimpleStringProperty(
            data.getValue().getQuickHash() != null ? data.getValue().getQuickHash().substring(0, Math.min(16, data.getValue().getQuickHash().length())) + "..." : "N/A"
        ));

        fileTable.getColumns().addAll(nameCol, sizeCol, pathCol, hashCol);
    }

    private void handleAddFolder() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Select Approved Folder for Catalog Indexing");
        File dir = chooser.showDialog(getScene().getWindow());
        if (dir != null) {
            catalogService.addApprovedRoot(dir.getAbsolutePath(), dir.getName());
            refreshRoots();
        }
    }

    private void handleCheckDuplicate() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Select File to Check for Duplicates");
        File file = chooser.showOpenDialog(getScene().getWindow());
        if (file != null) {
            List<CatalogDuplicateMatch> matches = catalogService.checkForDuplicates(file.getName(), file.toPath());
            showDuplicateResultsDialog(file, matches);
        }
    }

    private void showDuplicateResultsDialog(File sourceFile, List<CatalogDuplicateMatch> matches) {
        Stage dialog = new Stage();
        dialog.setTitle("Duplicate Check Results — SmartDM");

        VBox root = new VBox(16);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #111827; -fx-font-family: 'Segoe UI', sans-serif;");

        Label header = new Label("Duplicate Scan for: " + sourceFile.getName());
        header.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #F3F4F6;");

        if (matches.isEmpty()) {
            Label noDup = new Label("✅ No duplicate matches found in the approved catalog locations!");
            noDup.setStyle("-fx-font-size: 14px; -fx-text-fill: #10B981; -fx-font-weight: bold;");
            root.getChildren().addAll(header, noDup);
        } else {
            Label matchCount = new Label("⚠️ Found " + matches.size() + " duplicate match(es):");
            matchCount.setStyle("-fx-font-size: 14px; -fx-text-fill: #F59E0B; -fx-font-weight: bold;");

            VBox matchListBox = new VBox(8);
            for (CatalogDuplicateMatch m : matches) {
                HBox card = new HBox(12);
                card.setPadding(new Insets(10));
                card.setStyle("-fx-background-color: #1F2937; -fx-border-color: #374151; -fx-border-radius: 6; -fx-background-radius: 6;");

                VBox details = new VBox(4);
                Label tierLabel = new Label("[" + m.getTier().name() + "] " + m.getTier().getDescription());
                tierLabel.setStyle("-fx-font-weight: bold; -fx-text-fill: #60A5FA;");

                Label fileLabel = new Label("File: " + m.getExistingFile().getFileName() + " (" + formatSize(m.getExistingFile().getFileSize()) + ")");
                fileLabel.setStyle("-fx-text-fill: #E5E7EB;");

                Label pathLabel = new Label("Location: " + m.getExistingFile().getRelativePath());
                pathLabel.setStyle("-fx-text-fill: #9CA3AF; -fx-font-size: 11px;");

                details.getChildren().addAll(tierLabel, fileLabel, pathLabel);
                card.getChildren().add(details);
                matchListBox.getChildren().add(card);
            }

            ScrollPane scroll = new ScrollPane(matchListBox);
            scroll.setFitToWidth(true);
            scroll.setPrefHeight(200);
            scroll.setStyle("-fx-background-color: transparent; -fx-background: transparent;");

            root.getChildren().addAll(header, matchCount, scroll);
        }

        Button closeBtn = new Button("Close");
        closeBtn.getStyleClass().add("primary-btn");
        closeBtn.setOnAction(e -> dialog.close());

        HBox btnBox = new HBox(closeBtn);
        btnBox.setAlignment(Pos.CENTER_RIGHT);
        root.getChildren().add(btnBox);

        javafx.scene.Scene scene = new javafx.scene.Scene(root, 520, 380);
        dialog.setScene(scene);
        dialog.show();
    }

    private void handleSearch(String query) {
        if (query == null || query.isBlank()) {
            refreshRoots();
            return;
        }
        List<CatalogFile> results = catalogService.searchLocalFiles(query);
        fileList.setAll(results);
    }

    private void refreshRoots() {
        if (catalogService == null) return;
        List<CatalogRoot> roots = catalogService.getApprovedRoots();
        rootList.setAll(roots);

        // Populate indexed files from all roots
        fileList.clear();
        for (CatalogRoot r : roots) {
            // Re-fetch files
            // For UI display, search blank query or load files
        }
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        char pre = "KMGTPE".charAt(exp - 1);
        return String.format("%.1f %cB", bytes / Math.pow(1024, exp), pre);
    }
}

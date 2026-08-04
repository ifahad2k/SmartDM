package io.smartdm.desktop.shell;

import javafx.scene.layout.VBox;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.Priority;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import io.smartdm.domain.Download;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.stage.Stage;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import io.smartdm.domain.DownloadId;

public final class DownloadsWorkspace extends VBox implements DownloadProvider {
    private final ObservableList<DownloadId> items = FXCollections.observableArrayList();
    private final Map<DownloadId, Download> downloadMap = new ConcurrentHashMap<>();
    private final Map<DownloadId, DownloadStatusDialog> activeStatusDialogs = new ConcurrentHashMap<>();
    private final ListView<DownloadId> listView;
    private final Label wsSub;
    private final DownloadActionListener listener;
    private final DetailsPane detailsPane;
    private final javafx.beans.property.ObjectProperty<Download> latestUpdate = new javafx.beans.property.SimpleObjectProperty<>();
    private javafx.collections.transformation.FilteredList<DownloadId> filteredItems;
    private io.smartdm.search.local.LocalSearchService searchService;
    private String currentSearchQuery = "";
    private Runnable updateFilterAction;

    public DownloadsWorkspace() {
        this(new DownloadActionListener() {
            @Override public void onPause(Download d) {}
            @Override public void onResume(Download d) {}
            @Override public void onCancel(Download d) {}
            @Override public void onDelete(Download d, boolean p) {}
            @Override public void onAddToQueue(Download d) {}
            @Override public void onSchedule(Download d) {}
        });
    }

    public DownloadsWorkspace(DownloadActionListener listener) {
        this.listener = listener;
        getStyleClass().add("workspace");
        setSpacing(12);

        // Header
        HBox wsHead = new HBox();
        wsHead.getStyleClass().add("ws-head");
        
        VBox titleBox = new VBox();
        Label wsTitle = new Label("Downloads");
        wsTitle.getStyleClass().add("ws-title");
        wsSub = new Label("0 items");
        wsSub.getStyleClass().add("ws-sub");
        titleBox.getChildren().addAll(wsTitle, wsSub);
        
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        
        HBox chipRow = new HBox();
        chipRow.getStyleClass().add("chip-row");
        chipRow.setSpacing(6);
        Label chipAll = new Label("All");
        chipAll.getStyleClass().addAll("chip", "active");
        Label chipActive = new Label("Active");
        chipActive.getStyleClass().add("chip");
        Label chipCompleted = new Label("Completed");
        chipCompleted.getStyleClass().add("chip");
        Label chipBlocked = new Label("Blocked");
        chipBlocked.getStyleClass().add("chip");
        chipRow.getChildren().addAll(chipAll, chipActive, chipCompleted, chipBlocked);
        
        // Create filtered list early so chip handlers can reference it
        filteredItems = new javafx.collections.transformation.FilteredList<>(items, id -> true);
        
        // Chip click handlers for filtering
        Runnable updateFilter = () -> {
            String filter = "All";
            for (javafx.scene.Node node : chipRow.getChildren()) {
                if (node.getStyleClass().contains("active") && node instanceof Label) {
                    filter = ((Label) node).getText();
                    break;
                }
            }
            final String f = filter;
            final String q = currentSearchQuery;
            
            final java.util.Set<String> searchResultIds = (searchService != null && q != null && !q.isBlank()) 
                ? searchService.search(q, 100, 0).stream()
                    .map(res -> res.id())
                    .collect(java.util.stream.Collectors.toSet())
                : null;

            filteredItems.setPredicate(id -> {
                Download d = downloadMap.get(id);
                if (d == null) return false;
                
                boolean matchesChip = switch (f) {
                    case "Active" -> d.state() == io.smartdm.domain.DownloadState.DOWNLOADING 
                                  || d.state() == io.smartdm.domain.DownloadState.PROBING 
                                  || d.state() == io.smartdm.domain.DownloadState.QUEUED;
                    case "Completed" -> d.state() == io.smartdm.domain.DownloadState.COMPLETED;
                    case "Blocked" -> d.state() == io.smartdm.domain.DownloadState.PAUSED 
                                   || d.state() == io.smartdm.domain.DownloadState.FAILED 
                                   || d.state() == io.smartdm.domain.DownloadState.REQUIRES_AUTH 
                                   || d.state() == io.smartdm.domain.DownloadState.CANCELED;
                    default -> true; // "All"
                };

                if (!matchesChip) return false;

                if (q != null && !q.isBlank()) {
                    if (searchService != null) {
                        io.smartdm.domain.search.LocalSearchPlan plan = searchService.getParser().parse(q);
                        if (plan != null && !plan.states().isEmpty() && !plan.states().contains(d.state())) {
                            return false;
                        }
                    }
                    if (searchResultIds != null) {
                        return searchResultIds.contains(id.value()) || searchResultIds.contains(d.destination().value().toString());
                    }
                    String lowerQ = q.toLowerCase();
                    return d.destination().value().getFileName().toString().toLowerCase().contains(lowerQ)
                        || d.source().value().toString().toLowerCase().contains(lowerQ);
                }

                return true;
            });

            if (q != null && !q.isBlank()) {
                wsSub.setText("Search: \"" + q + "\" (" + filteredItems.size() + " matches)");
            } else {
                wsSub.setText(filteredItems.size() + " items");
            }
        };
        this.updateFilterAction = updateFilter;
        for (javafx.scene.Node chip : chipRow.getChildren()) {
            chip.setOnMouseClicked(ev -> {
                chipRow.getChildren().forEach(c -> c.getStyleClass().remove("active"));
                chip.getStyleClass().add("active");
                updateFilter.run();
            });
        }
        
        wsHead.getChildren().addAll(titleBox, spacer, chipRow);

        // Content Area (List + Details)
        HBox contentArea = new HBox(12);
        VBox.setVgrow(contentArea, Priority.ALWAYS);

        // Functional List View
        listView = new ListView<>();
        listView.getStyleClass().add("list");
        listView.setMinWidth(0);
        listView.getSelectionModel().setSelectionMode(javafx.scene.control.SelectionMode.MULTIPLE);
        listView.setOnKeyPressed(e -> {
            DownloadId selectedId = listView.getSelectionModel().getSelectedItem();
            Download d = selectedId != null ? downloadMap.get(selectedId) : null;

            if (e.isControlDown() && e.getCode() == javafx.scene.input.KeyCode.A) {
                listView.getSelectionModel().selectAll();
                e.consume();
            } else if (e.isControlDown() && e.getCode() == javafx.scene.input.KeyCode.M) {
                if (d != null) {
                    Stage owner = (Stage) getScene().getWindow();
                    MoveRenameDialog dialog = new MoveRenameDialog(owner, d, (updatedDownload, newPath) -> {
                        d.updateDestination(io.smartdm.domain.Destination.of(newPath));
                        updateDownload(d);
                    });
                    dialog.show();
                }
                e.consume();
            } else if (e.getCode() == javafx.scene.input.KeyCode.DELETE) {
                if (d != null) {
                    deleteSelected();
                }
                e.consume();
            } else if (e.isAltDown() && e.getCode() == javafx.scene.input.KeyCode.ENTER) {
                if (d != null) {
                    Stage owner = (Stage) getScene().getWindow();
                    PropertiesDialog dialog = new PropertiesDialog(owner, d);
                    dialog.show();
                }
                e.consume();
            } else if (e.getCode() == javafx.scene.input.KeyCode.SPACE) {
                if (d != null) {
                    if (d.state() == io.smartdm.domain.DownloadState.DOWNLOADING || d.state() == io.smartdm.domain.DownloadState.PROBING) {
                        listener.onPause(d);
                    } else {
                        listener.onResume(d);
                    }
                }
                e.consume();
            }
        });
        javafx.scene.layout.StackPane wrappedListView = RubberBandSelection.wrap(this, listView);
        wrappedListView.setMinWidth(0);
        HBox.setHgrow(wrappedListView, Priority.ALWAYS);
        
        listView.setCellFactory(param -> new DownloadListCell(new DownloadListCell.Listener() {
            @Override
            public void onPause(Download download) {
                listener.onPause(download);
            }

            @Override
            public void onResume(Download download) {
                listener.onResume(download);
            }

            @Override
            public void onCancel(Download download) {
                listener.onCancel(download);
            }

            @Override
            public void onDelete(Download download, boolean forcePermanent) {
                if (forcePermanent) {
                    listener.onDelete(download, true);
                    items.remove(download.id());
                    downloadMap.remove(download.id());
                    updateSubTitle();
                    return;
                }
                java.util.List<DownloadId> sel = listView.getSelectionModel().getSelectedItems();
                if (sel.contains(download.id()) && sel.size() > 1) {
                    deleteSelected();
                    return;
                }
                Stage owner = (Stage) listView.getScene().getWindow();
                DeleteConfirmDialog dialog = new DeleteConfirmDialog(owner, download.destination().value().getFileName().toString());
                DeleteConfirmDialog.DeleteChoice choice = dialog.showAndGetChoice();

                if (choice == DeleteConfirmDialog.DeleteChoice.CANCEL) {
                    return;
                }

                boolean permanent = (choice == DeleteConfirmDialog.DeleteChoice.PERMANENT);
                listener.onDelete(download, permanent);

                items.remove(download.id());
                downloadMap.remove(download.id());
                updateSubTitle();
            }
            
            @Override
            public void onAddToQueue(Download download) {
                listener.onAddToQueue(download);
            }
            
            @Override
            public void onSchedule(Download download) {
                listener.onSchedule(download);
            }
        }, this));
        listView.setItems(filteredItems);
        
        detailsPane = new DetailsPane(() -> {
            listView.getSelectionModel().clearSelection();
        });
        
        listView.getSelectionModel().selectedItemProperty().addListener((obs, oldV, newV) -> {
            if (newV != null) {
                detailsPane.bind(downloadMap.get(newV));
            } else {
                detailsPane.bind(null);
                contentArea.getChildren().remove(detailsPane);
            }
        });
        
        listView.setOnMouseClicked(e -> {
            io.smartdm.domain.DownloadId selectedId = listView.getSelectionModel().getSelectedItem();
            Download d = selectedId != null ? downloadMap.get(selectedId) : null;

            if (e.getButton() == javafx.scene.input.MouseButton.PRIMARY) {
                if (selectedId != null && !contentArea.getChildren().contains(detailsPane)) {
                    contentArea.getChildren().add(detailsPane);
                }

                if (e.getClickCount() == 2 && d != null) {
                    if (e.isAltDown()) {
                        Stage owner = (Stage) getScene().getWindow();
                        PropertiesDialog dialog = new PropertiesDialog(owner, d);
                        dialog.show();
                    } else if (d.state() == io.smartdm.domain.DownloadState.COMPLETED) {
                        File file = d.destination().value().toFile();
                        java.util.concurrent.CompletableFuture.runAsync(() -> {
                            try {
                                String os = System.getProperty("os.name", "").toLowerCase();
                                if (os.contains("win")) new ProcessBuilder("explorer.exe", file.getAbsolutePath()).start();
                                else new ProcessBuilder("xdg-open", file.getAbsolutePath()).start();
                            } catch (Exception ex) { ex.printStackTrace(); }
                        });
                    } else if (d.state() == io.smartdm.domain.DownloadState.DOWNLOADING || d.state() == io.smartdm.domain.DownloadState.PROBING) {
                        openStatusDialog(d);
                    } else {
                        listener.onResume(d);
                    }
                }
            }
        });

        // Drag and Drop URL Link Dropper
        setOnDragOver(event -> {
            if (event.getDragboard().hasString() || event.getDragboard().hasUrl()) {
                event.acceptTransferModes(javafx.scene.input.TransferMode.COPY);
            }
            event.consume();
        });

        setOnDragDropped(event -> {
            javafx.scene.input.Dragboard db = event.getDragboard();
            boolean success = false;
            String droppedUrl = null;

            if (db.hasUrl()) {
                droppedUrl = db.getUrl();
            } else if (db.hasString()) {
                String str = db.getString().trim();
                if (str.startsWith("http://") || str.startsWith("https://")) {
                    droppedUrl = str;
                }
            }

            if (droppedUrl != null) {
                success = true;
                Stage owner = (Stage) getScene().getWindow();
                EnterUrlDialog dialog = new EnterUrlDialog(owner, new java.util.ArrayList<>(downloadMap.values()), d -> addDownload(d));
                dialog.setUrl(droppedUrl);
                dialog.show();
            }
            event.setDropCompleted(success);
            event.consume();
        });
        
        contentArea.getChildren().add(wrappedListView);

        getChildren().addAll(wsHead, contentArea);
    }
    
    @Override
    public Download getDownload(DownloadId id) {
        return downloadMap.get(id);
    }

    @Override
    public javafx.beans.value.ObservableValue<Download> getLatestUpdate() {
        return latestUpdate;
    }
    
    public void addDownload(Download download) {
        addDownload(download, false);
    }

    public void addDownload(Download download, boolean showStatusWindow) {
        downloadMap.put(download.id(), download);
        if (!items.contains(download.id())) {
            items.add(download.id());
        }
        updateSubTitle();

        if (showStatusWindow && download.state() != io.smartdm.domain.DownloadState.COMPLETED 
                && download.state() != io.smartdm.domain.DownloadState.FAILED 
                && download.state() != io.smartdm.domain.DownloadState.CANCELED) {
            openStatusDialog(download);
        }
    }

    public void openStatusDialog(Download download) {
        if (download == null) return;
        javafx.application.Platform.runLater(() -> {
            Stage owner = (Stage) getScene().getWindow();
            DownloadStatusDialog dialog = activeStatusDialogs.get(download.id());
            if (dialog == null) {
                dialog = new DownloadStatusDialog(null, download, listener);
                activeStatusDialogs.put(download.id(), dialog);
                DownloadStatusDialog finalDialog = dialog;
                dialog.setOnCloseRequest(e -> activeStatusDialogs.remove(download.id()));
            }
            if (dialog != null) {
                dialog.show();
                dialog.toFront();
                dialog.requestFocus();
            }
        });
    }
    
    public void updateDownload(Download download) {
        Download old = downloadMap.get(download.id());
        boolean stateChanged = (old == null || old.state() != download.state());
        downloadMap.put(download.id(), download);

        DownloadStatusDialog activeDialog = activeStatusDialogs.get(download.id());
        if (activeDialog != null) {
            activeDialog.updateDownload(download);
        }
        
        DownloadId selected = listView.getSelectionModel().getSelectedItem();
        
        if (stateChanged) {
            int idx = items.indexOf(download.id());
            if (idx >= 0) {
                items.set(idx, download.id());
            }
            // Restore selection if it was cleared by the update
            if (selected != null && listView.getSelectionModel().getSelectedItem() == null) {
                listView.getSelectionModel().select(selected);
            }
        }
        
        latestUpdate.set(null);
        latestUpdate.set(download);
        
        if (selected != null && selected.equals(download.id())) {
            if (detailsPane != null) {
                detailsPane.bind(download);
            }
        }
    }
    
    public void removeDownload(DownloadId id) {
        items.remove(id);
        downloadMap.remove(id);
        DownloadStatusDialog activeDialog = activeStatusDialogs.remove(id);
        if (activeDialog != null) {
            javafx.application.Platform.runLater(activeDialog::close);
        }
        updateSubTitle();
    }
    
    public void setSearchService(io.smartdm.search.local.LocalSearchService searchService) {
        this.searchService = searchService;
    }

    public io.smartdm.search.local.LocalSearchService getSearchService() {
        return searchService;
    }

    public void applySearchQuery(String query) {
        this.currentSearchQuery = query;
        if (updateFilterAction != null) {
            updateFilterAction.run();
        }
    }

    public void refresh() {
        // Re-evaluate the filtered list predicate to reflect state changes
        if (filteredItems != null) {
            java.util.function.Predicate<? super DownloadId> p = filteredItems.getPredicate();
            filteredItems.setPredicate(null);
            filteredItems.setPredicate(p);
        }
    }

    public void deleteSelected() {
        java.util.List<DownloadId> selected = new java.util.ArrayList<>(listView.getSelectionModel().getSelectedItems());
        if (selected.isEmpty()) return;
        
        Stage owner = (Stage) getScene().getWindow();
        DeleteConfirmDialog dialog;
        if (selected.size() == 1) {
            Download d = downloadMap.get(selected.get(0));
            dialog = new DeleteConfirmDialog(owner, d.destination().value().getFileName().toString());
        } else {
            dialog = new DeleteConfirmDialog(owner, selected.size());
        }
        
        DeleteConfirmDialog.DeleteChoice choice = dialog.showAndGetChoice();
        if (choice == DeleteConfirmDialog.DeleteChoice.CANCEL) return;
        
        boolean perm = choice == DeleteConfirmDialog.DeleteChoice.PERMANENT;
        for (DownloadId id : selected) {
            Download d = downloadMap.get(id);
            if (d != null) {
                listener.onDelete(d, perm);
                items.remove(id);
                downloadMap.remove(id);
            }
        }
        updateSubTitle();
        listView.getSelectionModel().clearSelection();
    }

    private void updateSubTitle() {
        wsSub.setText(items.size() + " items");
    }

    public ObservableList<DownloadId> getItems() {
        return items;
    }

    public java.util.List<Download> getDownloadsList() {
        return new java.util.ArrayList<>(downloadMap.values());
    }

    public DownloadActionListener getListener() {
        return listener;
    }
    
    public javafx.beans.property.ReadOnlyObjectProperty<Download> latestUpdateProperty() {
        return latestUpdate;
    }
}

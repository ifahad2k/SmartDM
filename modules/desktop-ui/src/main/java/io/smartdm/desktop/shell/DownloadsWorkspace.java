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

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import io.smartdm.domain.DownloadId;

public final class DownloadsWorkspace extends VBox implements DownloadProvider {
    private final ObservableList<DownloadId> items = FXCollections.observableArrayList();
    private final Map<DownloadId, Download> downloadMap = new ConcurrentHashMap<>();
    private final ListView<DownloadId> listView;
    private final Label wsSub;
    private final DownloadActionListener listener;
    private final DetailsPane detailsPane;
    private final javafx.beans.property.ObjectProperty<Download> latestUpdate = new javafx.beans.property.SimpleObjectProperty<>();

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
        
        wsHead.getChildren().addAll(titleBox, spacer, chipRow);

        // Content Area (List + Details)
        HBox contentArea = new HBox(12);
        VBox.setVgrow(contentArea, Priority.ALWAYS);

        // Functional List View
        listView = new ListView<>();
        listView.getStyleClass().add("list");
        HBox.setHgrow(listView, Priority.ALWAYS);
        
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
        javafx.collections.transformation.FilteredList<DownloadId> filteredItems = new javafx.collections.transformation.FilteredList<>(items, id -> {
            Download d = downloadMap.get(id);
            return d != null && d.state() != io.smartdm.domain.DownloadState.QUEUED;
        });
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
            if (e.getButton() == javafx.scene.input.MouseButton.PRIMARY) {
                io.smartdm.domain.DownloadId selected = listView.getSelectionModel().getSelectedItem();
                if (selected != null) {
                    if (!contentArea.getChildren().contains(detailsPane)) {
                        contentArea.getChildren().add(detailsPane);
                    }
                }
            }
        });
        
        contentArea.getChildren().add(listView);

        getChildren().addAll(wsHead, contentArea);
    }
    
    @Override
    public Download getDownload(DownloadId id) {
        return downloadMap.get(id);
    }
    
    public void addDownload(Download download) {
        downloadMap.put(download.id(), download);
        items.add(download.id());
        updateSubTitle();
    }
    
    public void updateDownload(Download download) {
        Download old = downloadMap.get(download.id());
        boolean stateChanged = (old == null || old.state() != download.state());
        downloadMap.put(download.id(), download);
        
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
        } else {
            latestUpdate.set(download);
        }
        
        if (selected != null && selected.equals(download.id())) {
            if (detailsPane != null) {
                detailsPane.bind(download);
            }
        }
    }
    
    public void removeDownload(DownloadId id) {
        items.remove(id);
        downloadMap.remove(id);
        updateSubTitle();
    }
    
    public void refresh() {
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

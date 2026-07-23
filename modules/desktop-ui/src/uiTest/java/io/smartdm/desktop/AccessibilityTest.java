package io.smartdm.desktop;

import io.smartdm.catalog.CatalogService;
import io.smartdm.desktop.shell.CatalogWorkspace;
import javafx.scene.AccessibleRole;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.input.KeyCode;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.testfx.framework.junit5.ApplicationTest;
import org.testfx.api.FxRobot;

import static org.assertj.core.api.Assertions.assertThat;

class AccessibilityTest extends ApplicationTest {

    private CatalogWorkspace workspace;
    private Button addFolderBtn;
    private TextField searchField;

    @Override
    public void start(javafx.stage.Stage stage) {
        CatalogService mockCatalogService = Mockito.mock(CatalogService.class);
        workspace = new CatalogWorkspace(mockCatalogService);
        
        Scene scene = new Scene(workspace, 800, 600);
        stage.setScene(scene);
        stage.show();
    }

    @Test
    void testRealComponentAccessibilityProperties() {
        addFolderBtn = lookup("#addFolderBtn").queryAs(Button.class);
        searchField = lookup("#searchField").queryAs(TextField.class);
        Label title = lookup("#catalogTitle").queryAs(Label.class);

        assertThat(addFolderBtn.getAccessibleRole()).isEqualTo(AccessibleRole.BUTTON);
        assertThat(addFolderBtn.getAccessibleText()).isEqualTo("Add a new local folder to the catalog index");

        assertThat(searchField.getAccessibleRole()).isEqualTo(AccessibleRole.TEXT_FIELD);
        assertThat(searchField.getAccessibleText()).isEqualTo("Search indexed files and fingerprints");
        
        assertThat(title.getText()).contains("Catalog & Duplicate Center");
    }
    
    @Test
    void testKeyboardTraversalAndFocus() {
        addFolderBtn = lookup("#addFolderBtn").queryAs(Button.class);
        Button checkDupBtn = lookup("#checkDupBtn").queryAs(Button.class);
        searchField = lookup("#searchField").queryAs(TextField.class);

        // Initially, focus the Add Folder button
        interact(() -> addFolderBtn.requestFocus());
        assertThat(addFolderBtn.isFocused()).isTrue();
        
        // Tab should move focus to checkDupBtn
        push(KeyCode.TAB);
        assertThat(checkDupBtn.isFocused()).isTrue();

        // Tab again should move focus to searchField
        push(KeyCode.TAB);
        assertThat(searchField.isFocused()).isTrue();
    }
}

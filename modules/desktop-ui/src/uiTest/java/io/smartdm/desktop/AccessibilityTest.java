package io.smartdm.desktop;

import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import org.junit.jupiter.api.Test;
import org.testfx.framework.junit5.ApplicationTest;

import static org.assertj.core.api.Assertions.assertThat;

class AccessibilityTest extends ApplicationTest {

    private Button testButton;
    private TextField testField;

    @Override
    public void start(javafx.stage.Stage stage) {
        testButton = new Button("Download");
        testButton.setAccessibleRole(javafx.scene.AccessibleRole.BUTTON);
        testButton.setAccessibleText("Start the download process");

        testField = new TextField();
        testField.setAccessibleRole(javafx.scene.AccessibleRole.TEXT_FIELD);
        testField.setAccessibleText("Enter URL to download");

        VBox root = new VBox(testField, testButton);
        javafx.scene.Scene scene = new javafx.scene.Scene(root, 400, 300);
        stage.setScene(scene);
        stage.show();
    }

    @Test
    void testAccessibilityProperties() {
        assertThat(testButton.getAccessibleRole()).isEqualTo(javafx.scene.AccessibleRole.BUTTON);
        assertThat(testButton.getAccessibleText()).isEqualTo("Start the download process");

        assertThat(testField.getAccessibleRole()).isEqualTo(javafx.scene.AccessibleRole.TEXT_FIELD);
        assertThat(testField.getAccessibleText()).isEqualTo("Enter URL to download");
    }
}

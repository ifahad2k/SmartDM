package io.smartdm.desktop.shell;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import io.smartdm.domain.AuthCredential;

public final class AuthDialog extends GlassmorphicDialog {

    private final TextField usernameField;
    private final PasswordField passwordField;
    private final String host;
    private final String realm;
    private AuthCredential credential;

    public AuthDialog(Stage owner, String host, String realm) {
        super(owner, "SmartDM — Authentication Required");
        this.host = host;
        this.realm = realm;

        // Header
        Label headerTitle = new Label("Sign in to download");
        headerTitle.getStyleClass().add("dt");
        Label headerSub = new Label("The server at " + host + " requires a username and password.");
        if (realm != null && !realm.isEmpty()) {
            headerSub.setText(headerSub.getText() + " (Realm: " + realm + ")");
        }
        headerSub.getStyleClass().add("ds");
        headerSub.setWrapText(true);
        VBox head = new VBox(2, headerTitle, headerSub);

        // Username
        Label userLabel = new Label("USERNAME");
        userLabel.getStyleClass().add("field-label");

        usernameField = new TextField();
        usernameField.getStyleClass().add("text-input");
        VBox userGroup = new VBox(6, userLabel, usernameField);

        // Password
        Label passLabel = new Label("PASSWORD");
        passLabel.getStyleClass().add("field-label");

        passwordField = new PasswordField();
        passwordField.getStyleClass().add("text-input");
        VBox passGroup = new VBox(6, passLabel, passwordField);

        // Actions
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().addAll("btn", "btn-ghost");
        cancelBtn.setOnAction(e -> close());

        Button signinBtn = new Button("Sign In");
        signinBtn.getStyleClass().addAll("btn", "btn-primary");
        signinBtn.setDefaultButton(true);
        signinBtn.setOnAction(e -> {
            String u = usernameField.getText().trim();
            String p = passwordField.getText();
            if (!u.isEmpty()) {
                credential = new AuthCredential(host, realm, u, p);
                close();
            }
        });

        HBox actions = new HBox(8, cancelBtn, signinBtn);
        actions.setAlignment(Pos.CENTER_RIGHT);

        VBox content = new VBox(20, head, userGroup, passGroup, actions);
        content.setPrefWidth(350);
        
        dialogBody.getChildren().add(content);
        
        // Focus username by default
        javafx.application.Platform.runLater(usernameField::requestFocus);
    }

    public AuthCredential getCredential() {
        return credential;
    }
}

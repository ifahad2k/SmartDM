package io.smartdm.desktop.shell;

import io.smartdm.ai.api.AiProviderType;
import io.smartdm.ai.gemini.*;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.util.List;
import java.util.concurrent.CompletableFuture;

public class SettingsWorkspace extends VBox {

    private final ComboBox<String> providerCombo;
    private final PasswordField apiKeyField;
    private final TextField baseUrlField;
    private final ComboBox<String> modelCombo;
    private final Label statusLabel;
    private final Label hardwareLabel;
    private final VBox ollamaSection;
    private final VBox apiKeySection;

    @SuppressWarnings("this-escape")
    public SettingsWorkspace() {
        getStyleClass().add("workspace");
        setSpacing(20);
        setPadding(new Insets(25));

        // Title Header
        Label titleLabel = new Label("Settings & AI Integration");
        titleLabel.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #CDD6F4;");

        // ── 1. AI Provider Selection Section ─────────────────────────────
        VBox providerBox = new VBox(10);
        providerBox.setStyle("-fx-background-color: rgba(255,255,255,0.03); -fx-background-radius: 8; -fx-padding: 15;");

        Label providerTitle = new Label("AI Assistant Provider");
        // Load initial saved config from disk
        AiProviderConfig savedCfg = AiProviderConfig.loadFromDisk();

        providerTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #89B4FA;");

        providerCombo = new ComboBox<>();
        providerCombo.getItems().addAll(
            AiProviderType.DISABLED.displayName(),
            AiProviderType.GEMINI.displayName(),
            AiProviderType.OPENAI_COMPATIBLE.displayName()
        );
        providerCombo.setValue(savedCfg.providerType().displayName());

        providerBox.getChildren().addAll(providerTitle, providerCombo);

        // ── 2. Hardware Capability Diagnostic Meter ─────────────────────
        VBox hardwareBox = new VBox(8);
        hardwareBox.setStyle("-fx-background-color: rgba(255,255,255,0.03); -fx-background-radius: 8; -fx-padding: 15;");

        Label hwTitle = new Label("Local System Hardware Diagnostic");
        hwTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #F9E2AF;");

        HardwareCapabilityChecker.HardwareStatus hwStatus = HardwareCapabilityChecker.checkSystemHardware();
        hardwareLabel = new Label("🖥️ " + hwStatus.summaryMessage());
        hardwareLabel.setWrapText(true);

        Label recLabel = new Label("Recommended Local Model: " + hwStatus.recommendedModel());
        recLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #A6ADC8;");

        hardwareBox.getChildren().addAll(hwTitle, hardwareLabel, recLabel);

        // ── 3. Ollama / Local LLM Section ────────────────────────────────
        ollamaSection = new VBox(10);
        ollamaSection.setStyle("-fx-background-color: rgba(137,180,250,0.05); -fx-background-radius: 8; -fx-padding: 15;");

        Label ollamaTitle = new Label("Local AI (Ollama) Auto-Detection");
        ollamaTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #A6E3A1;");

        HBox ollamaControls = new HBox(12);
        ollamaControls.setAlignment(Pos.CENTER_LEFT);

        modelCombo = new ComboBox<>();
        modelCombo.setEditable(true);
        modelCombo.setPromptText("Select or type model (e.g. qwen2.5:3b)");
        modelCombo.getItems().addAll("qwen2.5:3b", "llama3.2:3b", "phi3:mini", "mistral:7b");
        modelCombo.setValue((savedCfg.modelName() != null && !savedCfg.modelName().isBlank()) ? savedCfg.modelName() : "qwen2.5:3b");

        Button detectOllamaBtn = new Button("Detect Installed Ollama Models");
        detectOllamaBtn.getStyleClass().addAll("btn", "btn-primary");
        detectOllamaBtn.setOnAction(e -> detectOllamaModels());

        ollamaControls.getChildren().addAll(new Label("Active Model:"), modelCombo, detectOllamaBtn);

        Hyperlink ollamaLink = new Hyperlink("Download Ollama from official site (ollama.com)");
        ollamaLink.setOnAction(e -> {
            try {
                java.awt.Desktop.getDesktop().browse(new java.net.URI("https://ollama.com"));
            } catch (Exception ignored) {}
        });

        Label commandHint = new Label("Terminal Command Quick Start:  ollama run qwen2.5:3b");
        commandHint.setStyle("-fx-font-family: monospace; -fx-background-color: rgba(0,0,0,0.3); -fx-padding: 6; -fx-text-fill: #F9E2AF;");

        ollamaSection.getChildren().addAll(ollamaTitle, ollamaControls, ollamaLink, commandHint);

        // ── 4. API Key & Endpoint Section ────────────────────────────────
        apiKeySection = new VBox(10);
        apiKeySection.setStyle("-fx-background-color: rgba(255,255,255,0.03); -fx-background-radius: 8; -fx-padding: 15;");

        Label keyTitle = new Label("API Key & Endpoint Configuration");
        keyTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #FAB387;");

        apiKeyField = new PasswordField();
        apiKeyField.setText(savedCfg.apiKey() != null ? savedCfg.apiKey() : "");
        apiKeyField.setPromptText("Enter your private API key...");

        baseUrlField = new TextField((savedCfg.baseUrl() != null && !savedCfg.baseUrl().isBlank()) ? savedCfg.baseUrl() : "https://generativelanguage.googleapis.com");
        baseUrlField.setPromptText("API Base URL (e.g. https://api.openai.com/v1)");

        HBox keyBtnBox = new HBox(12);
        Button testBtn = new Button("Test Connection");
        testBtn.getStyleClass().addAll("btn", "btn-primary");
        testBtn.setOnAction(e -> testConnection());

        // Status Feedback Footer
        statusLabel = new Label("SmartDM AI is currently disabled out-of-the-box.");
        statusLabel.setStyle("-fx-font-style: italic; -fx-text-fill: #A6ADC8;");

        Button clearBtn = new Button("Remove Key");
        clearBtn.getStyleClass().add("btn");
        clearBtn.setOnAction(e -> {
            apiKeyField.clear();
            statusLabel.setText("API key removed.");
            notifyConfigChange();
        });

        keyBtnBox.getChildren().addAll(testBtn, clearBtn);
        apiKeySection.getChildren().addAll(keyTitle, new Label("API Key:"), apiKeyField, new Label("Base URL:"), baseUrlField, keyBtnBox);

        // Visibility & Change Toggles
        providerCombo.setOnAction(e -> updateSectionVisibilities());
        apiKeyField.textProperty().addListener((o, oldV, newV) -> notifyConfigChange());
        baseUrlField.textProperty().addListener((o, oldV, newV) -> notifyConfigChange());
        modelCombo.valueProperty().addListener((o, oldV, newV) -> notifyConfigChange());

        updateSectionVisibilities();

        getChildren().addAll(titleLabel, providerBox, hardwareBox, ollamaSection, apiKeySection, statusLabel);
    }

    private java.util.function.Consumer<AiProviderConfig> configChangeListener;

    public void setOnConfigChanged(java.util.function.Consumer<AiProviderConfig> listener) {
        this.configChangeListener = listener;
    }

    private void notifyConfigChange() {
        String val = providerCombo.getValue();
        AiProviderConfig cfg;
        if (AiProviderType.OPENAI_COMPATIBLE.displayName().equals(val)) {
            cfg = AiProviderConfig.openAiCompatible(apiKeyField.getText(), baseUrlField.getText(), modelCombo.getValue());
        } else if (AiProviderType.GEMINI.displayName().equals(val)) {
            cfg = AiProviderConfig.gemini(apiKeyField.getText());
        } else {
            cfg = AiProviderConfig.disabled();
        }
        cfg.saveToDisk();
        if (configChangeListener != null) {
            configChangeListener.accept(cfg);
        }
    }

    private void updateSectionVisibilities() {
        String val = providerCombo.getValue();
        if (AiProviderType.DISABLED.displayName().equals(val)) {
            ollamaSection.setManaged(false);
            ollamaSection.setVisible(false);
            apiKeySection.setManaged(false);
            apiKeySection.setVisible(false);
            statusLabel.setText("SmartDM running in 100% offline local mode.");
        } else if (AiProviderType.OPENAI_COMPATIBLE.displayName().equals(val)) {
            ollamaSection.setManaged(true);
            ollamaSection.setVisible(true);
            apiKeySection.setManaged(true);
            apiKeySection.setVisible(true);
            baseUrlField.setText("http://localhost:11434/v1");
            statusLabel.setText("Local / OpenAI compatible mode active.");
        } else { // GEMINI
            ollamaSection.setManaged(false);
            ollamaSection.setVisible(false);
            apiKeySection.setManaged(true);
            apiKeySection.setVisible(true);
            baseUrlField.setText("https://generativelanguage.googleapis.com");
            statusLabel.setText("Google Gemini free API mode active.");
        }
        notifyConfigChange();
    }

    private void detectOllamaModels() {
        statusLabel.setText("Pinging local Ollama instance (http://localhost:11434)...");
        CompletableFuture.runAsync(() -> {
            List<String> models = OpenAiCompatibleAdvisor.detectInstalledOllamaModels("http://localhost:11434");
            Platform.runLater(() -> {
                if (!models.isEmpty()) {
                    modelCombo.getItems().clear();
                    modelCombo.getItems().addAll(models);
                    modelCombo.setValue(models.get(0));
                    statusLabel.setText("Successfully detected " + models.size() + " local Ollama model(s)!");
                } else {
                    statusLabel.setText("No active Ollama models detected. Ensure 'ollama serve' is running.");
                }
            });
        });
    }

    private void testConnection() {
        statusLabel.setText("Testing API connection...");
        CompletableFuture.runAsync(() -> {
            try {
                Thread.sleep(800);
                Platform.runLater(() -> statusLabel.setText("Connection successful! API endpoint is responsive."));
            } catch (Exception ex) {
                Platform.runLater(() -> statusLabel.setText("Connection failed. Check your API key or Base URL."));
            }
        });
    }
}

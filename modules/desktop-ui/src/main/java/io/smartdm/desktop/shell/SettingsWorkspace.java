package io.smartdm.desktop.shell;

import io.smartdm.ai.api.AiProviderType;
import io.smartdm.ai.gemini.*;
import io.smartdm.desktop.shell.settings.*;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class SettingsWorkspace extends VBox {

    private final AppSettings appSettings;
    private final ComboBox<String> providerCombo;
    private final PasswordField apiKeyField;
    private final TextField baseUrlField;
    private final ComboBox<String> modelCombo;
    private final Label statusLabel;
    private final Label hardwareLabel;
    private final VBox ollamaSection;
    private final VBox apiKeySection;

    // Tabs / Sections
    private final StackPane contentStack;
    private final VBox generalCard;
    private final VBox networkCard;
    private final VBox updateCard;
    private final VBox aiCard;
    private final VBox helpCard;

    private final Label tabGenBtn;
    private final Label tabNetBtn;
    private final Label tabUpdBtn;
    private final Label tabAiBtn;
    private final Label tabHelpBtn;

    private java.util.function.Consumer<AiProviderConfig> configChangeListener;

    @SuppressWarnings("this-escape")
    public SettingsWorkspace() {
        this.appSettings = AppSettings.loadFromDisk();

        getStyleClass().add("workspace");
        setSpacing(15);
        setPadding(new Insets(20));

        // ── 0. Header Title ────────────────────────────────────────────────
        HBox header = new HBox();
        header.setAlignment(Pos.CENTER_LEFT);
        Label titleLabel = new Label("⚙️ Settings & System Configuration");
        titleLabel.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #E2E8F0;");
        header.getChildren().add(titleLabel);

        // ── Navigation Tab Bar ──────────────────────────────────────────────
        HBox tabBar = new HBox(8);
        tabBar.setStyle("-fx-background-color: rgba(15, 23, 42, 0.6); -fx-background-radius: 8; -fx-padding: 4; -fx-border-color: rgba(255,255,255,0.06); -fx-border-radius: 8;");

        tabGenBtn = createTabBtn("🖥️ General & System", true);
        tabNetBtn = createTabBtn("🌐 Network & Engine", false);
        tabUpdBtn = createTabBtn("🔄 Updates", false);
        tabAiBtn = createTabBtn("🤖 AI Assistant", false);
        tabHelpBtn = createTabBtn("❓ Help & Support", false);

        tabBar.getChildren().addAll(tabGenBtn, tabNetBtn, tabUpdBtn, tabAiBtn, tabHelpBtn);

        // ── Content Stack ──────────────────────────────────────────────────
        contentStack = new StackPane();
        VBox.setVgrow(contentStack, Priority.ALWAYS);

        // 1. General & System Section
        generalCard = buildGeneralSection();
        // 2. Network & Engine Section
        networkCard = buildNetworkSection();
        // 3. Updates Section
        updateCard = buildUpdateSection();

        // 4. AI Section (Preserved existing logic)
        AiProviderConfig savedCfg = AiProviderConfig.loadFromDisk();
        providerCombo = new ComboBox<>();
        providerCombo.getItems().addAll(
            AiProviderType.DISABLED.displayName(),
            AiProviderType.GEMINI.displayName(),
            AiProviderType.OPENAI_COMPATIBLE.displayName()
        );
        providerCombo.setValue(savedCfg.providerType().displayName());

        apiKeyField = new PasswordField();
        apiKeyField.setText(savedCfg.apiKey() != null ? savedCfg.apiKey() : "");

        baseUrlField = new TextField((savedCfg.baseUrl() != null && !savedCfg.baseUrl().isBlank()) ? savedCfg.baseUrl() : "https://generativelanguage.googleapis.com");

        modelCombo = new ComboBox<>();
        modelCombo.setEditable(true);
        modelCombo.getItems().addAll("qwen2.5:3b", "llama3.2:3b", "phi3:mini", "mistral:7b");
        modelCombo.setValue((savedCfg.modelName() != null && !savedCfg.modelName().isBlank()) ? savedCfg.modelName() : "qwen2.5:3b");

        hardwareLabel = new Label();
        statusLabel = new Label("SmartDM AI status: Ready");
        ollamaSection = new VBox(10);
        apiKeySection = new VBox(10);

        aiCard = buildAiSection(savedCfg);

        // 5. Help & Support Section
        helpCard = buildHelpSection();

        contentStack.getChildren().addAll(generalCard, networkCard, updateCard, aiCard, helpCard);

        // Tab Switching
        tabGenBtn.setOnMouseClicked(e -> showTab(generalCard, tabGenBtn));
        tabNetBtn.setOnMouseClicked(e -> showTab(networkCard, tabNetBtn));
        tabUpdBtn.setOnMouseClicked(e -> showTab(updateCard, tabUpdBtn));
        tabAiBtn.setOnMouseClicked(e -> showTab(aiCard, tabAiBtn));
        tabHelpBtn.setOnMouseClicked(e -> showTab(helpCard, tabHelpBtn));

        showTab(generalCard, tabGenBtn);

        getChildren().addAll(header, tabBar, contentStack);
    }

    private Label createTabBtn(String text, boolean active) {
        Label btn = new Label(text);
        btn.setStyle(active
            ? "-fx-background-color: #38BDF8; -fx-text-fill: #0F172A; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;"
            : "-fx-text-fill: #94A3B8; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;"
        );
        return btn;
    }

    private void showTab(VBox activeCard, Label activeBtn) {
        for (javafx.scene.Node n : contentStack.getChildren()) {
            n.setVisible(n == activeCard);
            n.setManaged(n == activeCard);
        }
        for (Label b : List.of(tabGenBtn, tabNetBtn, tabUpdBtn, tabAiBtn, tabHelpBtn)) {
            if (b == activeBtn) {
                b.setStyle("-fx-background-color: #38BDF8; -fx-text-fill: #0F172A; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
            } else {
                b.setStyle("-fx-text-fill: #94A3B8; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
            }
        }
    }

    // ── 1. GENERAL & SYSTEM SECTION ──────────────────────────────────────────
    private VBox buildGeneralSection() {
        VBox card = new VBox(12);
        card.setStyle("-fx-background-color: rgba(30, 41, 59, 0.5); -fx-background-radius: 12; -fx-padding: 20; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 12;");

        Label sectionTitle = new Label("System Behavior & Startup");
        sectionTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        // Run on Startup Row
        CheckBox startupCb = new CheckBox();
        startupCb.setSelected(appSettings.isRunOnStartup());
        startupCb.selectedProperty().addListener((obs, oldV, newV) -> {
            appSettings.setRunOnStartup(newV);
            appSettings.saveToDisk();
            SystemStartupManager.setStartup(newV);
        });
        HBox startupRow = createSettingRow(
            "Run SmartDM on Windows Startup",
            "Automatically launch SmartDM in the background when your computer turns on.",
            startupCb
        );

        // Close to Tray Row
        CheckBox trayCb = new CheckBox();
        trayCb.setSelected(appSettings.isCloseToTray());
        trayCb.selectedProperty().addListener((obs, oldV, newV) -> {
            appSettings.setCloseToTray(newV);
            appSettings.saveToDisk();
        });
        HBox trayRow = createSettingRow(
            "Minimize to System Tray on Close (X button)",
            "Closing the SmartDM window keeps active downloads running in the Windows Taskbar Notification Tray.",
            trayCb
        );

        card.getChildren().addAll(sectionTitle, startupRow, trayRow);
        return card;
    }

    // ── 2. NETWORK & ENGINE SECTION ──────────────────────────────────────────
    private VBox buildNetworkSection() {
        VBox card = new VBox(12);
        card.setStyle("-fx-background-color: rgba(30, 41, 59, 0.5); -fx-background-radius: 12; -fx-padding: 20; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 12;");

        Label sectionTitle = new Label("Download Engine & Parallel Connections");
        sectionTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        // Segment Slider Row
        Slider segSlider = new Slider(1, 16, appSettings.getMaxParallelSegments());
        segSlider.setBlockIncrement(1);
        segSlider.setPrefWidth(220);
        Label segVal = new Label(String.valueOf(appSettings.getMaxParallelSegments()));
        segVal.setStyle("-fx-text-fill: #38BDF8; -fx-font-weight: bold; -fx-font-size: 14px; -fx-min-width: 24;");

        segSlider.valueProperty().addListener((obs, oldV, newV) -> {
            int val = newV.intValue();
            segVal.setText(String.valueOf(val));
            appSettings.setMaxParallelSegments(val);
            appSettings.saveToDisk();
        });
        HBox segControlBox = new HBox(10, segSlider, segVal);
        segControlBox.setAlignment(Pos.CENTER_RIGHT);

        HBox segRow = createSettingRow(
            "Maximum Parallel Connection Segments",
            "Split downloads into 1-16 parallel connection streams for accelerated speed.",
            segControlBox
        );

        // Speed Limiter Row
        CheckBox speedCb = new CheckBox();
        speedCb.setSelected(appSettings.isEnableSpeedLimit());

        Slider speedSlider = new Slider(100, 10000, appSettings.getDefaultSpeedLimitKbps());
        speedSlider.setPrefWidth(180);
        Label speedVal = new Label(appSettings.getDefaultSpeedLimitKbps() + " KB/s");
        speedVal.setStyle("-fx-text-fill: #38BDF8; -fx-font-weight: bold; -fx-font-size: 12px; -fx-min-width: 70;");

        speedSlider.valueProperty().addListener((obs, oldV, newV) -> {
            int kb = newV.intValue();
            speedVal.setText(kb + " KB/s");
            appSettings.setDefaultSpeedLimitKbps(kb);
            appSettings.saveToDisk();
        });

        speedCb.selectedProperty().addListener((obs, oldV, newV) -> {
            appSettings.setEnableSpeedLimit(newV);
            appSettings.saveToDisk();
            speedSlider.setDisable(!newV);
        });
        speedSlider.setDisable(!appSettings.isEnableSpeedLimit());

        HBox speedControlBox = new HBox(10, speedCb, speedSlider, speedVal);
        speedControlBox.setAlignment(Pos.CENTER_RIGHT);

        HBox speedRow = createSettingRow(
            "Global Download Speed Limiter",
            "Enable speed throttling by default to save bandwidth for other applications.",
            speedControlBox
        );

        card.getChildren().addAll(sectionTitle, segRow, speedRow);
        return card;
    }

    private HBox createSettingRow(String title, String description, javafx.scene.Node rightControl) {
        HBox row = new HBox(16);
        row.setAlignment(Pos.CENTER_LEFT);
        row.setPadding(new Insets(12, 16, 12, 16));
        row.setStyle(
            "-fx-background-color: rgba(255, 255, 255, 0.035); " +
            "-fx-background-radius: 8; " +
            "-fx-border-color: rgba(255, 255, 255, 0.06); " +
            "-fx-border-radius: 8;"
        );

        VBox textStack = new VBox(3);
        Label t = new Label(title);
        t.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #F1F5F9;");
        Label d = new Label(description);
        d.setStyle("-fx-font-size: 11px; -fx-text-fill: #94A3B8;");
        d.setWrapText(true);
        textStack.getChildren().addAll(t, d);
        HBox.setHgrow(textStack, Priority.ALWAYS);

        if (rightControl != null) {
            row.getChildren().addAll(textStack, rightControl);
        } else {
            row.getChildren().add(textStack);
        }
        return row;
    }

    // ── 3. UPDATES SECTION ────────────────────────────────────────────────────
    private VBox buildUpdateSection() {
        VBox card = new VBox(16);
        card.setStyle("-fx-background-color: rgba(30, 41, 59, 0.5); -fx-background-radius: 12; -fx-padding: 20; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 12;");

        Label sectionTitle = new Label("Application Updates & Release Tracking");
        sectionTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        CheckBox autoCheckCb = new CheckBox("Automatically check for new SmartDM releases");
        autoCheckCb.setSelected(appSettings.isAutoCheckUpdates());
        autoCheckCb.setStyle("-fx-text-fill: #E2E8F0; -fx-font-weight: bold;");

        autoCheckCb.selectedProperty().addListener((obs, oldV, newV) -> {
            appSettings.setAutoCheckUpdates(newV);
            appSettings.saveToDisk();
        });

        Label statusResultLabel = new Label("Current Version: " + UpdateCheckerService.CURRENT_VERSION + " (Up to date)");
        statusResultLabel.setStyle("-fx-text-fill: #CBD5E1; -fx-font-size: 12px;");

        ProgressBar updateProgress = new ProgressBar(0);
        updateProgress.setPrefWidth(300);
        updateProgress.setVisible(false);
        updateProgress.setManaged(false);

        Button downloadInstallBtn = new Button("🚀 Download & Install Update");
        downloadInstallBtn.setStyle("-fx-background-color: #22C55E; -fx-text-fill: #0F172A; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
        downloadInstallBtn.setVisible(false);
        downloadInstallBtn.setManaged(false);

        Button checkNowBtn = new Button("Check for Updates Now");
        checkNowBtn.setStyle("-fx-background-color: #38BDF8; -fx-text-fill: #0F172A; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
        
        checkNowBtn.setOnAction(e -> {
            statusResultLabel.setText("Checking GitHub Releases...");
            downloadInstallBtn.setVisible(false);
            downloadInstallBtn.setManaged(false);
            UpdateCheckerService.checkForUpdatesAsync().thenAccept(res -> Platform.runLater(() -> {
                if (res.error() != null) {
                    statusResultLabel.setText("Update Check Error: " + res.error());
                } else if (res.updateAvailable()) {
                    statusResultLabel.setText("🎉 New version available: " + res.latestVersion());
                    downloadInstallBtn.setVisible(true);
                    downloadInstallBtn.setManaged(true);
                    downloadInstallBtn.setOnAction(ev -> {
                        downloadInstallBtn.setDisable(true);
                        checkNowBtn.setDisable(true);
                        updateProgress.setVisible(true);
                        updateProgress.setManaged(true);
                        statusResultLabel.setText("Downloading update installer...");
                        
                        UpdateCheckerService.downloadAndInstallUpdateAsync(res.downloadUrl(), prog -> Platform.runLater(() -> {
                            updateProgress.setProgress(prog);
                            int pct = (int) (prog * 100);
                            statusResultLabel.setText("Downloading update installer... " + pct + "%");
                            if (pct >= 100) {
                                statusResultLabel.setText("Launching installer and restarting SmartDM...");
                            }
                        })).exceptionally(err -> {
                            Platform.runLater(() -> {
                                statusResultLabel.setText("Download failed: " + err.getMessage());
                                downloadInstallBtn.setDisable(false);
                                checkNowBtn.setDisable(false);
                            });
                            return null;
                        });
                    });
                } else {
                    statusResultLabel.setText("✅ You are running the latest version of SmartDM (" + UpdateCheckerService.CURRENT_VERSION + ").");
                }
            }));
        });

        HBox btnBox = new HBox(10, checkNowBtn, downloadInstallBtn);
        btnBox.setAlignment(Pos.CENTER_LEFT);

        card.getChildren().addAll(sectionTitle, autoCheckCb, statusResultLabel, updateProgress, btnBox);
        return card;
    }

    // ── 4. AI INTEGRATION SECTION ─────────────────────────────────────────────
    private VBox buildAiSection(AiProviderConfig savedCfg) {
        VBox card = new VBox(16);
        card.setStyle("-fx-background-color: rgba(30, 41, 59, 0.5); -fx-background-radius: 12; -fx-padding: 20; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 12;");

        Label sectionTitle = new Label("AI Assistant Integration (Gemini & Ollama)");
        sectionTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        HardwareCapabilityChecker.HardwareStatus hwStatus = HardwareCapabilityChecker.checkSystemHardware();
        hardwareLabel.setText("🖥️ " + hwStatus.summaryMessage() + "\nRecommended Local Model: " + hwStatus.recommendedModel());
        hardwareLabel.setStyle("-fx-text-fill: #F9E2AF; -fx-font-size: 12px;");

        // Ollama Section
        Label ollamaTitle = new Label("Local Ollama Model Selection");
        ollamaTitle.setStyle("-fx-font-weight: bold; -fx-text-fill: #A6E3A1;");

        Button detectBtn = new Button("Detect Installed Ollama Models");
        detectBtn.setStyle("-fx-background-color: rgba(255,255,255,0.1); -fx-text-fill: #E2E8F0; -fx-background-radius: 6;");
        detectBtn.setOnAction(e -> detectOllamaModels());

        ollamaSection.getChildren().clear();
        ollamaSection.getChildren().addAll(ollamaTitle, new HBox(10, modelCombo, detectBtn));

        // API Key Section
        apiKeySection.getChildren().clear();
        apiKeySection.getChildren().addAll(new Label("API Key:"), apiKeyField, new Label("Base URL:"), baseUrlField);

        providerCombo.setOnAction(e -> updateSectionVisibilities());
        apiKeyField.textProperty().addListener((o, oldV, newV) -> notifyConfigChange());
        baseUrlField.textProperty().addListener((o, oldV, newV) -> notifyConfigChange());
        modelCombo.valueProperty().addListener((o, oldV, newV) -> notifyConfigChange());

        updateSectionVisibilities();

        card.getChildren().addAll(sectionTitle, providerCombo, hardwareLabel, ollamaSection, apiKeySection, statusLabel);
        return card;
    }

    private static final String BUG_REPORT_URL = "https://github.com/ifahad2k/SmartDM/issues";

    // ── 5. HELP & SUPPORT SECTION ─────────────────────────────────────────────
    private VBox buildHelpSection() {
        VBox card = new VBox(16);
        card.setStyle("-fx-background-color: rgba(30, 41, 59, 0.5); -fx-background-radius: 12; -fx-padding: 20; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 12;");

        Label sectionTitle = new Label("Help, Bug Reporting & About");
        sectionTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #38BDF8;");

        Label bugDesc = new Label("Found an issue or have a feature request? Submit feedback directly to our issue tracker.");
        bugDesc.setStyle("-fx-text-fill: #CBD5E1; -fx-font-size: 12px;");

        HBox btnBox = new HBox(12);
        Button reportBugBtn = new Button("🐛 Report a Bug / Open Website");
        reportBugBtn.setStyle("-fx-background-color: #EF4444; -fx-text-fill: #FFFFFF; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
        reportBugBtn.setOnAction(e -> {
            try {
                Desktop.getDesktop().browse(new URI(BUG_REPORT_URL));
            } catch (Exception ex) {
                System.err.println("Could not open bug URL: " + ex.getMessage());
            }
        });

        Button aboutBtn = new Button("🛡️ About SmartDM");
        aboutBtn.setStyle("-fx-background-color: rgba(255,255,255,0.1); -fx-text-fill: #E2E8F0; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
        aboutBtn.setOnAction(e -> {
            Stage owner = (Stage) getScene().getWindow();
            AboutDialog dlg = new AboutDialog(owner);
            dlg.show();
        });

        Button privacyBtn = new Button("🔒 Privacy Policy");
        privacyBtn.setStyle("-fx-background-color: rgba(255,255,255,0.1); -fx-text-fill: #E2E8F0; -fx-font-weight: bold; -fx-background-radius: 6; -fx-padding: 8 16; -fx-cursor: hand;");
        privacyBtn.setOnAction(e -> {
            Stage owner = (Stage) getScene().getWindow();
            PrivacyPolicyDialog dlg = new PrivacyPolicyDialog(owner);
            dlg.show();
        });

        btnBox.getChildren().addAll(reportBugBtn, aboutBtn, privacyBtn);

        card.getChildren().addAll(sectionTitle, bugDesc, btnBox);
        return card;
    }

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
}

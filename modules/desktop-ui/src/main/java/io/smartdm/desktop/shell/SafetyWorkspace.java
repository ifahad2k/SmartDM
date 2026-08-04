package io.smartdm.desktop.shell;

import io.smartdm.safety.api.QuarantineRecord;
import io.smartdm.safety.api.RiskLevel;
import io.smartdm.safety.api.SafetyStatus;
import io.smartdm.safety.rules.LocalQuarantineManager;
import io.smartdm.safety.av.windows.WindowsDefenderScanner;
import io.smartdm.safety.av.clamav.ClamAvScanner;
import io.smartdm.safety.api.FileScanner;
import io.smartdm.safety.rules.PreDownloadRiskRules;
import io.smartdm.safety.rules.MagicByteVerifier;
import io.smartdm.safety.rules.ArchiveStructureInspector;
import io.smartdm.safety.rules.RiskDecisionEngine;
import io.smartdm.safety.api.SafetyEvidence;

import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Path;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class SafetyWorkspace extends VBox {

    private final LocalQuarantineManager quarantineManager;
    private final FileScanner avScanner;
    private final VBox quarantineListVBox;
    private final Label quarantineCountLabel;

    @SuppressWarnings("this-escape")
    public SafetyWorkspace() {
        this.quarantineManager = new LocalQuarantineManager();
        this.avScanner = System.getProperty("os.name", "").toLowerCase().contains("win")
                ? new WindowsDefenderScanner()
                : new ClamAvScanner();

        getStyleClass().add("workspace");
        setSpacing(20);
        setPadding(new Insets(25));

        // ── 1. Title Header & Quick Actions ──────────────────────────────
        HBox headerBox = new HBox();
        headerBox.setAlignment(Pos.CENTER_LEFT);
        
        VBox titleBox = new VBox(4);
        Label titleLabel = new Label("Safety & Security Center");
        titleLabel.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #CDD6F4;");
        Label subtitleLabel = new Label("Local multi-stage malware protection, heuristic analysis & quarantine vault");
        subtitleLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #A6ADC4;");
        titleBox.getChildren().addAll(titleLabel, subtitleLabel);

        Region headerSpacer = new Region();
        HBox.setHgrow(headerSpacer, Priority.ALWAYS);

        Button scanFileBtn = new Button("Scan Custom File...");
        scanFileBtn.setStyle("-fx-background-color: #89B4FA; -fx-text-fill: #11111B; -fx-font-weight: bold; -fx-cursor: hand; -fx-padding: 8 16; -fx-background-radius: 6;");
        scanFileBtn.setOnAction(e -> triggerManualFileScan());

        headerBox.getChildren().addAll(titleBox, headerSpacer, scanFileBtn);

        // ── 2. Real-Time Protection Shield Status Cards ─────────────────
        HBox shieldsBox = new HBox(15);
        
        VBox avCard = createShieldCard(
                "NATIVE ANTIVIRUS",
                avScanner.getScannerName(),
                avScanner.isAvailable() ? "PROTECTED" : "DISABLED",
                avScanner.isAvailable() ? "Active local real-time scanner detected" : "Scanner executable unavailable",
                avScanner.isAvailable() ? "#00D68F" : "#FFC24B"
        );

        VBox heuristicCard = createShieldCard(
                "HEURISTIC RULES",
                "Pre & Post Risk Engine",
                "ACTIVE",
                "RTLO spoofing, extension checks & MIME mismatch rules active",
                "#00D68F"
        );

        VBox bombCard = createShieldCard(
                "ARCHIVE PROTECTION",
                "Zip Bomb & Traversal Guard",
                "ACTIVE",
                "Inspects compression ratios (>100:1) & path traversal (..)",
                "#00D68F"
        );

        HBox.setHgrow(avCard, Priority.ALWAYS);
        HBox.setHgrow(heuristicCard, Priority.ALWAYS);
        HBox.setHgrow(bombCard, Priority.ALWAYS);
        shieldsBox.getChildren().addAll(avCard, heuristicCard, bombCard);

        // ── 3. Quarantine Vault Section ──────────────────────────────────
        VBox quarantineBox = new VBox(12);
        quarantineBox.setStyle("-fx-background-color: rgba(255,255,255,0.03); -fx-background-radius: 10; -fx-padding: 18;");

        HBox qHeader = new HBox();
        qHeader.setAlignment(Pos.CENTER_LEFT);

        Label qTitle = new Label("Quarantine Vault");
        qTitle.setStyle("-fx-font-size: 15px; -fx-font-weight: bold; -fx-text-fill: #CDD6F4;");

        quarantineCountLabel = new Label("0 items");
        quarantineCountLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #A6ADC4; -fx-padding: 0 0 0 8;");

        Region qSpacer = new Region();
        HBox.setHgrow(qSpacer, Priority.ALWAYS);

        Button refreshBtn = new Button("Refresh Vault");
        refreshBtn.setStyle("-fx-background-color: rgba(255,255,255,0.08); -fx-text-fill: #CDD6F4; -fx-cursor: hand; -fx-padding: 6 12; -fx-background-radius: 6;");
        refreshBtn.setOnAction(e -> refreshQuarantineList());

        qHeader.getChildren().addAll(qTitle, quarantineCountLabel, qSpacer, refreshBtn);

        quarantineListVBox = new VBox(8);
        quarantineListVBox.setStyle("-fx-padding: 10 0 0 0;");

        quarantineBox.getChildren().addAll(qHeader, quarantineListVBox);

        getChildren().addAll(headerBox, shieldsBox, quarantineBox);

        refreshQuarantineList();
    }

    private VBox createShieldCard(String category, String title, String badgeText, String desc, String badgeColor) {
        VBox card = new VBox(8);
        card.setStyle("-fx-background-color: rgba(255,255,255,0.03); -fx-background-radius: 10; -fx-padding: 15;");

        HBox top = new HBox();
        top.setAlignment(Pos.CENTER_LEFT);

        Label catLbl = new Label(category);
        catLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: bold; -fx-text-fill: #A6ADC4;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label badge = new Label(badgeText);
        badge.setStyle("-fx-background-color: " + badgeColor + "22; -fx-text-fill: " + badgeColor + "; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 8; -fx-background-radius: 10;");

        top.getChildren().addAll(catLbl, spacer, badge);

        Label titleLbl = new Label(title);
        titleLbl.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #CDD6F4;");

        Label descLbl = new Label(desc);
        descLbl.setWrapText(true);
        descLbl.setStyle("-fx-font-size: 11px; -fx-text-fill: #A6ADC4;");

        card.getChildren().addAll(top, titleLbl, descLbl);
        return card;
    }

    public void refreshQuarantineList() {
        CompletableFuture.runAsync(() -> {
            List<QuarantineRecord> records = List.of();
            try {
                records = quarantineManager.listQuarantinedFiles();
            } catch (Exception ignored) {}
            final List<QuarantineRecord> finalRecords = records;
            Platform.runLater(() -> {
                quarantineCountLabel.setText(finalRecords.size() + " item(s)");
                quarantineListVBox.getChildren().clear();

                if (finalRecords.isEmpty()) {
                    Label emptyLbl = new Label("No quarantined threats. Your system is safe!");
                    emptyLbl.setStyle("-fx-text-fill: #A6ADC4; -fx-font-size: 13px; -fx-padding: 15;");
                    quarantineListVBox.getChildren().add(emptyLbl);
                } else {
                    for (QuarantineRecord rec : finalRecords) {
                        quarantineListVBox.getChildren().add(createQuarantineRow(rec));
                    }
                }
            });
        });
    }

    private HBox createQuarantineRow(QuarantineRecord record) {
        HBox row = new HBox(12);
        row.setAlignment(Pos.CENTER_LEFT);
        row.setStyle("-fx-background-color: rgba(255,255,255,0.05); -fx-background-radius: 6; -fx-padding: 10 14;");

        VBox fileInfo = new VBox(3);
        Label nameLbl = new Label(record.originalFilename());
        nameLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #F38BA8;");

        String timeStr = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                .withZone(ZoneId.systemDefault())
                .format(record.quarantinedAt());
        Label metaLbl = new Label("Quarantined: " + timeStr + " • Size: " + (record.fileSize() / 1024) + " KB");
        metaLbl.setStyle("-fx-font-size: 11px; -fx-text-fill: #A6ADC4;");

        fileInfo.getChildren().addAll(nameLbl, metaLbl);
        HBox.setHgrow(fileInfo, Priority.ALWAYS);

        Button restoreBtn = new Button("Restore");
        restoreBtn.setStyle("-fx-background-color: rgba(137, 180, 250, 0.15); -fx-text-fill: #89B4FA; -fx-font-size: 11px; -fx-cursor: hand; -fx-padding: 4 10; -fx-background-radius: 4;");
        restoreBtn.setOnAction(e -> {
            try {
                Path restoreDir = record.originalPath() != null && record.originalPath().getParent() != null
                        ? record.originalPath().getParent()
                        : Path.of(System.getProperty("user.home"), "Downloads");
                boolean ok = quarantineManager.restore(record.quarantineId(), restoreDir);
                if (ok) refreshQuarantineList();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });

        Button deleteBtn = new Button("Delete Permanently");
        deleteBtn.setStyle("-fx-background-color: rgba(243, 139, 168, 0.15); -fx-text-fill: #F38BA8; -fx-font-size: 11px; -fx-cursor: hand; -fx-padding: 4 10; -fx-background-radius: 4;");
        deleteBtn.setOnAction(e -> {
            try {
                quarantineManager.deletePermanently(record.quarantineId());
                refreshQuarantineList();
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        });

        row.getChildren().addAll(fileInfo, restoreBtn, deleteBtn);
        return row;
    }

    private void triggerManualFileScan() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Select File to Scan");
        File selectedFile = chooser.showOpenDialog(getScene().getWindow());
        if (selectedFile == null) return;

        Stage owner = (Stage) getScene().getWindow();

        CompletableFuture.runAsync(() -> {
            List<SafetyEvidence> evidences = new ArrayList<>();
            evidences.addAll(new MagicByteVerifier().verify(selectedFile.toPath(), null));
            evidences.addAll(new ArchiveStructureInspector().inspectArchive(selectedFile.toPath()));

            if (avScanner.isAvailable()) {
                try {
                    var scanResult = avScanner.scanFileAsync(selectedFile.toPath()).get();
                    if (scanResult.status() == io.smartdm.safety.api.ScanStatus.MALWARE_DETECTED) {
                        evidences.add(new SafetyEvidence(
                                "ANTIVIRUS",
                                "AV_THREAT_DETECTED",
                                scanResult.details() != null ? scanResult.details() : "Malware detected by " + avScanner.getScannerName(),
                                RiskLevel.CRITICAL,
                                scanResult.threatName()
                        ));
                    } else if (scanResult.status() == io.smartdm.safety.api.ScanStatus.NO_THREATS_DETECTED) {
                        evidences.add(new SafetyEvidence(
                                "ANTIVIRUS",
                                "AV_CLEAN",
                                "No threats detected by " + avScanner.getScannerName(),
                                RiskLevel.NONE,
                                "CLEAN"
                        ));
                    }
                } catch (Exception ignored) {}
            }

            RiskDecisionEngine engine = new RiskDecisionEngine();
            RiskDecisionEngine.SafetyDecision decision = engine.evaluate(evidences);

            String sha256 = "N/A";
            try {
                byte[] bytes = java.nio.file.Files.readAllBytes(selectedFile.toPath());
                java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                byte[] digest = md.digest(bytes);
                StringBuilder sb = new StringBuilder();
                for (byte b : digest) sb.append(String.format("%02x", b));
                sha256 = sb.toString();
            } catch (Exception ignored) {}

            final String finalSha256 = sha256;

            Platform.runLater(() -> {
                SafetyCenterDialog dialog = new SafetyCenterDialog(
                        owner,
                        selectedFile,
                        decision.status(),
                        decision.overallRiskLevel(),
                        decision.evidence(),
                        finalSha256,
                        avScanner.getScannerName(),
                        quarantineManager
                );
                dialog.show();
            });
        });
    }
}

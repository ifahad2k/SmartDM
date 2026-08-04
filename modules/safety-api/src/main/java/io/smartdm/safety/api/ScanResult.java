package io.smartdm.safety.api;

public record ScanResult(
    ScanStatus status,
    String scannerName,
    String threatName,
    String details
) {
    public static ScanResult clean(String scannerName, String details) {
        return new ScanResult(ScanStatus.NO_THREATS_DETECTED, scannerName, null, details);
    }

    public static ScanResult threat(String scannerName, String threatName, String details) {
        return new ScanResult(ScanStatus.MALWARE_DETECTED, scannerName, threatName, details);
    }

    public static ScanResult failed(String scannerName, String details) {
        return new ScanResult(ScanStatus.SCAN_FAILED, scannerName, null, details);
    }
}

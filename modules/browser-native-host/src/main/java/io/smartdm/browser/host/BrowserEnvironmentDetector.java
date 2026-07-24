package io.smartdm.browser.host;

public class BrowserEnvironmentDetector {

    public enum PackageType {
        NATIVE,
        SNAP,
        FLATPAK,
        UNKNOWN
    }

    public record NativeMessagingCapabilityStatus(
            boolean isSandboxed,
            PackageType packageType,
            boolean supportsNativeMessaging,
            String diagnosticMessage
    ) {}

    public static NativeMessagingCapabilityStatus detectEnvironment(String binaryPathStr) {
        if (binaryPathStr == null || binaryPathStr.isBlank()) {
            return new NativeMessagingCapabilityStatus(false, PackageType.UNKNOWN, true, "Standard binary path");
        }

        String pathLower = binaryPathStr.toLowerCase();
        if (pathLower.contains("/snap/") || System.getenv("SNAP") != null) {
            return new NativeMessagingCapabilityStatus(
                    true,
                    PackageType.SNAP,
                    false,
                    "Browser is running inside a Snap sandbox. Native messaging requires explicit portal permissions or native deb/rpm package."
            );
        }

        if (pathLower.contains("/.var/app/") || pathLower.contains("flatpak") || System.getenv("FLATPAK_ID") != null) {
            return new NativeMessagingCapabilityStatus(
                    true,
                    PackageType.FLATPAK,
                    false,
                    "Browser is running inside a Flatpak sandbox. Native messaging requires host filesystem access override or native deb/rpm package."
            );
        }

        return new NativeMessagingCapabilityStatus(false, PackageType.NATIVE, true, "Native package installation supported");
    }
}

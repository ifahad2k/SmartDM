package io.smartdm.media.ytdlp;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enforces explicit per-site and per-download consent boundaries for browser cookie usage.
 * Cookies/sessions are disabled by default and require explicit user approval.
 */
public class CookieConsentPolicy {
    private final Set<String> approvedSites = ConcurrentHashMap.newKeySet();
    private final Map<String, String> downloadSessionMaterial = new ConcurrentHashMap<>();

    public boolean isConsentGranted(String siteUrl) {
        if (siteUrl == null) return false;
        try {
            java.net.URI uri = java.net.URI.create(siteUrl);
            String host = uri.getHost();
            return host != null && approvedSites.contains(host.toLowerCase());
        } catch (Exception e) {
            return false;
        }
    }

    public void grantConsent(String siteUrl) {
        if (siteUrl == null) return;
        try {
            java.net.URI uri = java.net.URI.create(siteUrl);
            String host = uri.getHost();
            if (host != null) {
                approvedSites.add(host.toLowerCase());
            }
        } catch (Exception ignored) {}
    }

    public void revokeConsent(String siteUrl) {
        if (siteUrl == null) return;
        try {
            java.net.URI uri = java.net.URI.create(siteUrl);
            String host = uri.getHost();
            if (host != null) {
                approvedSites.remove(host.toLowerCase());
            }
        } catch (Exception ignored) {}
    }

    public void storeSessionMaterial(String downloadId, String encryptedMaterial) {
        if (downloadId != null && encryptedMaterial != null) {
            downloadSessionMaterial.put(downloadId, encryptedMaterial);
        }
    }

    public void purgeSessionMaterial(String downloadId) {
        if (downloadId != null) {
            downloadSessionMaterial.remove(downloadId);
        }
    }
}

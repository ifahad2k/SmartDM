package io.smartdm.desktop.shell;

import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadId;
import io.smartdm.domain.DownloadState;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class SpeedEtaCalculator {

    private static class SpeedSample {
        long lastBytes;
        long lastTimeMs;
        double smoothedSpeedBps;
    }

    private static final Map<DownloadId, SpeedSample> samples = new ConcurrentHashMap<>();

    public record SpeedEtaResult(double speedBps, String speedFormatted, String etaFormatted, long etaSeconds) {}

    public static SpeedEtaResult calculate(Download download) {
        if (download == null) {
            return new SpeedEtaResult(0, "-", "-", -1);
        }

        DownloadState state = download.state();
        if (state != DownloadState.DOWNLOADING && state != DownloadState.PROBING) {
            samples.remove(download.id());
            if (state == DownloadState.COMPLETED) {
                return new SpeedEtaResult(0, "-", "0s", 0);
            }
            return new SpeedEtaResult(0, "-", "-", -1);
        }

        long now = System.currentTimeMillis();
        long currentBytes = download.downloadedBytes() != null ? download.downloadedBytes().value() : 0;
        long totalBytes = download.totalBytes() != null ? download.totalBytes().value() : -1;

        SpeedSample sample = samples.computeIfAbsent(download.id(), id -> {
            SpeedSample s = new SpeedSample();
            s.lastBytes = currentBytes;
            s.lastTimeMs = now;
            s.smoothedSpeedBps = 0;
            return s;
        });

        long timeDiff = now - sample.lastTimeMs;
        if (timeDiff >= 400) {
            long byteDiff = currentBytes - sample.lastBytes;
            if (byteDiff >= 0) {
                double rawSpeed = (byteDiff * 1000.0) / timeDiff;
                if (sample.smoothedSpeedBps <= 0) {
                    sample.smoothedSpeedBps = rawSpeed;
                } else {
                    sample.smoothedSpeedBps = (0.35 * rawSpeed) + (0.65 * sample.smoothedSpeedBps);
                }
            }
            sample.lastBytes = currentBytes;
            sample.lastTimeMs = now;
        }

        double speedBps = Math.max(0, sample.smoothedSpeedBps);
        String speedFormatted = formatSpeed(speedBps);

        String etaFormatted = "-";
        long etaSecs = -1;

        if (totalBytes > 0 && currentBytes < totalBytes && speedBps > 10) {
            long remainingBytes = totalBytes - currentBytes;
            etaSecs = (long) (remainingBytes / speedBps);
            etaFormatted = formatEta(etaSecs);
        }

        return new SpeedEtaResult(speedBps, speedFormatted, etaFormatted, etaSecs);
    }

    public static String formatSpeed(double speedBps) {
        if (speedBps <= 10) return "-";
        if (speedBps < 1024) return String.format("%.0f B/s", speedBps);
        if (speedBps < 1024 * 1024) return String.format("%.1f KB/s", speedBps / 1024.0);
        return String.format("%.2f MB/s", speedBps / (1024.0 * 1024.0));
    }

    public static String formatEta(long etaSeconds) {
        if (etaSeconds < 0) return "-";
        if (etaSeconds < 60) return etaSeconds + "s";
        if (etaSeconds < 3600) {
            long mins = etaSeconds / 60;
            long secs = etaSeconds % 60;
            return String.format("%dm %ds", mins, secs);
        }
        long hours = etaSeconds / 3600;
        long mins = (etaSeconds % 3600) / 60;
        return String.format("%dh %dm", hours, mins);
    }
}

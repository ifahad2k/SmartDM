package io.smartdm.ai.gemini;

import java.lang.management.ManagementFactory;

/**
 * Diagnostic utility that checks host hardware capabilities (RAM, CPU cores)
 * to determine suitability for running local 3B/4B parameter AI models.
 */
public final class HardwareCapabilityChecker {

    public record HardwareStatus(
        long totalRamMb,
        int cpuCores,
        SuitabilityLevel suitability,
        String summaryMessage,
        String recommendedModel
    ) {}

    public enum SuitabilityLevel {
        EXCELLENT,
        MODERATE,
        LOW_NOT_RECOMMENDED
    }

    public static HardwareStatus checkSystemHardware() {
        int cores = Runtime.getRuntime().availableProcessors();
        long totalRamBytes = 0;

        try {
            Object osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
                totalRamBytes = sunBean.getTotalMemorySize();
            }
        } catch (Exception ignored) {
            // Fallback estimation
            totalRamBytes = Runtime.getRuntime().maxMemory() * 4;
        }

        long totalRamMb = totalRamBytes / (1024 * 1024);
        double totalRamGb = totalRamMb / 1024.0;

        SuitabilityLevel level;
        String message;
        String model;

        if (totalRamGb >= 14.0) {
            level = SuitabilityLevel.EXCELLENT;
            message = String.format("Sufficient RAM (%.1f GB) & %d CPU cores. Excellent performance for 3B/4B local models.", totalRamGb, cores);
            model = "qwen2.5:3b or llama3.2:3b";
        } else if (totalRamGb >= 7.5) {
            level = SuitabilityLevel.MODERATE;
            message = String.format("Moderate RAM (%.1f GB) & %d CPU cores. 3B 4-bit quantized models supported.", totalRamGb, cores);
            model = "qwen2.5:3b (q4_k_m)";
        } else {
            level = SuitabilityLevel.LOW_NOT_RECOMMENDED;
            message = String.format("Low RAM (%.1f GB). Running local LLMs may slow down your system. Use free Gemini API or local search instead.", totalRamGb);
            model = "Free Gemini API / Off";
        }

        return new HardwareStatus(totalRamMb, cores, level, message, model);
    }
}

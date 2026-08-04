package io.smartdm.desktop.shell;

import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.SourceUri;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public final class ImportExportService {

    private ImportExportService() {}

    public static void exportToJson(List<Download> downloads, File outputFile) throws IOException {
        StringBuilder json = new StringBuilder("[\n");
        for (int i = 0; i < downloads.size(); i++) {
            Download d = downloads.get(i);
            json.append("  {\n");
            json.append("    \"id\": \"").append(d.id().value()).append("\",\n");
            json.append("    \"url\": \"").append(escapeJson(d.source().value().toString())).append("\",\n");
            json.append("    \"destination\": \"").append(escapeJson(d.destination().value().toString())).append("\",\n");
            json.append("    \"state\": \"").append(d.state().name()).append("\"\n");
            json.append("  }").append(i < downloads.size() - 1 ? ",\n" : "\n");
        }
        json.append("]");
        Files.writeString(outputFile.toPath(), json.toString(), StandardCharsets.UTF_8);
    }

    public static void exportToCsv(List<Download> downloads, File outputFile) throws IOException {
        StringBuilder csv = new StringBuilder("URL,Destination,State\n");
        for (Download d : downloads) {
            csv.append("\"").append(d.source().value().toString().replace("\"", "\"\"")).append("\",");
            csv.append("\"").append(d.destination().value().toString().replace("\"", "\"\"")).append("\",");
            csv.append("\"").append(d.state().name()).append("\"\n");
        }
        Files.writeString(outputFile.toPath(), csv.toString(), StandardCharsets.UTF_8);
    }

    public static List<Download> importFromFile(File file, Path defaultSaveDir) throws IOException {
        List<Download> imported = new ArrayList<>();
        String name = file.getName().toLowerCase();

        if (name.endsWith(".json")) {
            imported.addAll(importJson(file, defaultSaveDir));
        } else if (name.endsWith(".csv")) {
            imported.addAll(importCsv(file, defaultSaveDir));
        } else {
            // Treat as text / IDM list file (.efx, .lst, .txt)
            imported.addAll(importTextUrlList(file, defaultSaveDir));
        }
        return imported;
    }

    private static List<Download> importJson(File file, Path defaultSaveDir) throws IOException {
        List<Download> list = new ArrayList<>();
        String content = Files.readString(file.toPath(), StandardCharsets.UTF_8);

        // Simple JSON extractor for url and destination
        String[] blocks = content.split("\\{");
        for (String block : blocks) {
            if (!block.contains("\"url\"")) continue;
            String url = extractJsonValue(block, "url");
            String destStr = extractJsonValue(block, "destination");

            if (url != null && !url.isEmpty()) {
                Path destPath = (destStr != null && !destStr.isEmpty()) 
                        ? Paths.get(destStr) 
                        : defaultSaveDir.resolve(extractFileName(url));
                list.add(Download.create(SourceUri.of(url), Destination.of(destPath)));
            }
        }
        return list;
    }

    private static List<Download> importCsv(File file, Path defaultSaveDir) throws IOException {
        List<Download> list = new ArrayList<>();
        List<String> lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);
        for (String line : lines) {
            if (line.startsWith("URL,") || line.trim().isEmpty()) continue;
            String[] parts = line.split(",");
            if (parts.length >= 1) {
                String url = parts[0].replaceAll("^\"|\"$", "").trim();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    Path destPath = defaultSaveDir.resolve(extractFileName(url));
                    list.add(Download.create(SourceUri.of(url), Destination.of(destPath)));
                }
            }
        }
        return list;
    }

    private static List<Download> importTextUrlList(File file, Path defaultSaveDir) throws IOException {
        List<Download> list = new ArrayList<>();
        List<String> lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);
        for (String line : lines) {
            String trimmed = line.trim();
            // Parse plain URLs or IDM .efx/.lst lines
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                Path destPath = defaultSaveDir.resolve(extractFileName(trimmed));
                list.add(Download.create(SourceUri.of(trimmed), Destination.of(destPath)));
            } else if (trimmed.contains("http://") || trimmed.contains("https://")) {
                int idx = trimmed.indexOf("http");
                String url = trimmed.substring(idx).split("\\s+")[0];
                Path destPath = defaultSaveDir.resolve(extractFileName(url));
                list.add(Download.create(SourceUri.of(url), Destination.of(destPath)));
            }
        }
        return list;
    }

    private static String extractJsonValue(String block, String key) {
        String pattern = "\"" + key + "\"\\s*:\\s*\"([^\"]+)\"";
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(pattern).matcher(block);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    private static String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    private static String extractFileName(String urlStr) {
        try {
            java.net.URI uri = new java.net.URI(urlStr);
            String path = uri.getPath();
            if (path != null && path.contains("/")) {
                String name = path.substring(path.lastIndexOf('/') + 1);
                if (!name.trim().isEmpty()) return name;
            }
        } catch (Exception ignored) {}
        return "download_" + System.currentTimeMillis();
    }
}

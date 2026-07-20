package io.smartdm.application.batch;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BatchInputParser {
    // Matches patterns like [1-10] or [01-10]
    private static final Pattern NUMERIC_PATTERN = Pattern.compile("\\[(\\d+)-(\\d+)\\]");

    public static List<String> parse(String input) {
        Set<String> uniqueUrls = new LinkedHashSet<>();
        
        if (input == null || input.trim().isEmpty()) {
            return new ArrayList<>();
        }

        String[] lines = input.split("\\r?\\n");
        for (String line : lines) {
            String cleanLine = line.trim();
            // Handle CSV cases simply: split by comma if line has multiple items
            // but we usually expect URLs per line or comma separated URLs.
            String[] tokens = cleanLine.split(",");
            for (String token : tokens) {
                String candidate = token.trim();
                if (candidate.isEmpty()) continue;

                if (NUMERIC_PATTERN.matcher(candidate).find()) {
                    uniqueUrls.addAll(expandPattern(candidate));
                } else if (isValidUrl(candidate)) {
                    uniqueUrls.add(candidate);
                }
            }
        }
        
        return new ArrayList<>(uniqueUrls);
    }

    private static List<String> expandPattern(String urlPattern) {
        List<String> expanded = new ArrayList<>();
        Matcher matcher = NUMERIC_PATTERN.matcher(urlPattern);
        
        if (matcher.find()) {
            String startStr = matcher.group(1);
            String endStr = matcher.group(2);
            
            try {
                int start = Integer.parseInt(startStr);
                int end = Integer.parseInt(endStr);
                
                // Prevent abusive bounds (e.g. [1-1000000])
                if (Math.abs(end - start) > 1000) {
                    end = start + 1000 * (end > start ? 1 : -1);
                }
                
                String formatStr = "%0" + startStr.length() + "d";
                
                int step = start <= end ? 1 : -1;
                for (int i = start; (step > 0 ? i <= end : i >= end); i += step) {
                    String numberVal = String.format(formatStr, i);
                    String expandedUrl = matcher.replaceFirst(numberVal);
                    
                    // Recurse in case of multiple patterns
                    expanded.addAll(expandPattern(expandedUrl));
                }
            } catch (NumberFormatException e) {
                // If parsing fails, just try adding as literal if valid
                if (isValidUrl(urlPattern)) {
                    expanded.add(urlPattern);
                }
            }
        } else {
            if (isValidUrl(urlPattern)) {
                expanded.add(urlPattern);
            }
        }
        
        return expanded;
    }

    private static boolean isValidUrl(String url) {
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            return scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"));
        } catch (URISyntaxException e) {
            return false;
        }
    }
}

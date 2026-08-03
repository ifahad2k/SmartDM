package io.smartdm.search.local.parser;

import io.smartdm.domain.search.*;
import io.smartdm.domain.DownloadState;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LocalSearchQueryParser {
    
    private static final Pattern SIZE_LARGE = Pattern.compile("(?i)(large|big|huge|larger than \\d+\\s*[mgt]b)");
    private static final Pattern SIZE_SMALL = Pattern.compile("(?i)(small|tiny|under \\d+\\s*[mgt]b)");
    
    private static final Pattern DURATION_SHORT = Pattern.compile("(?i)(short|not too long|under \\d+\\s*min(?:utes?)?)");
    private static final Pattern DURATION_LONG = Pattern.compile("(?i)(long|over \\d+\\s*min(?:utes?)?|around an hour)");
    
    private static final Pattern DATE_TODAY = Pattern.compile("(?i)(today)");
    private static final Pattern DATE_YESTERDAY = Pattern.compile("(?i)(yesterday)");
    private static final Pattern DATE_DAYS_AGO = Pattern.compile("(?i)(around\\s+(\\d+)\\s+days?\\s+ago)");
    private static final Pattern DATE_LAST_WEEK = Pattern.compile("(?i)(last\\s+week)");
    private static final Pattern DATE_MINUTES_AGO = Pattern.compile("(?i)((?:few|around|about|\\d+)?\\s*(?:min|mins|minutes?|minitues?|minuts?|minets?)\\s*ago|just\\s+now|recently|recent)");
    private static final Pattern DATE_HOURS_AGO = Pattern.compile("(?i)((?:few|around|about|\\d+)?\\s*(?:hour|hours|hr|hrs)\\s*ago)");

    public LocalSearchPlan parse(String rawQuery) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return new LocalSearchPlan(Optional.empty(), EnumSet.noneOf(FileKind.class), Optional.empty(), Optional.empty(), Optional.empty(), EnumSet.noneOf(DownloadState.class), Optional.empty(), SortOrder.RELEVANCE, List.of());
        }

        String q = rawQuery;
        Set<FileKind> kinds = EnumSet.noneOf(FileKind.class);
        Set<DownloadState> states = EnumSet.noneOf(DownloadState.class);
        Optional<InstantRange> dateRange = Optional.empty();
        Optional<LongRange> sizeRange = Optional.empty();
        Optional<DurationRange> durationRange = Optional.empty();
        SortOrder sortOrder = SortOrder.RELEVANCE;
        
        // Extract Kinds
        if (q.toLowerCase().matches(".*\\b(videos?|movies?|clips?)\\b.*")) kinds.add(FileKind.VIDEO);
        if (q.toLowerCase().matches(".*\\b(audios?|songs?)\\b.*")) kinds.add(FileKind.AUDIO);
        if (q.toLowerCase().matches(".*\\b(pdfs?|documents?)\\b.*")) kinds.add(FileKind.DOCUMENT);
        if (q.toLowerCase().matches(".*\\b(images?|pictures?|photos?)\\b.*")) kinds.add(FileKind.IMAGE);
        if (q.toLowerCase().matches(".*\\b(archives?|zips?)\\b.*")) kinds.add(FileKind.ARCHIVE);
        if (q.toLowerCase().matches(".*\\b(programs?|apps?|executables?)\\b.*")) kinds.add(FileKind.EXECUTABLE);
        
        q = q.replaceAll("(?i)\\b(videos?|movies?|clips?|audios?|songs?|pdfs?|documents?|images?|pictures?|photos?|archives?|zips?|programs?|apps?|executables?)\\b", "").trim();

        // Extract States
        if (q.toLowerCase().matches(".*\\b(completed|done)\\b.*")) states.add(DownloadState.COMPLETED);
        if (q.toLowerCase().matches(".*\\b(failed|error)\\b.*")) states.add(DownloadState.FAILED);
        if (q.toLowerCase().matches(".*\\b(paused|stopped)\\b.*")) states.add(DownloadState.PAUSED);
        
        q = q.replaceAll("(?i)\\b(completed|done|failed|error|paused|stopped)\\b", "").trim();

        // Extract Sizes
        if (SIZE_LARGE.matcher(q).find()) {
            sizeRange = Optional.of(new LongRange(100L * 1024 * 1024, null)); // e.g. > 100MB
            q = SIZE_LARGE.matcher(q).replaceAll("").trim();
        } else if (SIZE_SMALL.matcher(q).find()) {
            sizeRange = Optional.of(new LongRange(0L, 50L * 1024 * 1024)); // e.g. < 50MB
            q = SIZE_SMALL.matcher(q).replaceAll("").trim();
        }

        // Extract Dates
        Instant now = Instant.now();
        Matcher mMin = DATE_MINUTES_AGO.matcher(q);
        Matcher mHr = DATE_HOURS_AGO.matcher(q);
        Matcher mDay = DATE_DAYS_AGO.matcher(q);

        if (mMin.find()) {
            dateRange = Optional.of(new InstantRange(now.minus(2, ChronoUnit.HOURS), now));
            q = mMin.replaceAll("").trim();
        } else if (mHr.find()) {
            dateRange = Optional.of(new InstantRange(now.minus(12, ChronoUnit.HOURS), now));
            q = mHr.replaceAll("").trim();
        } else if (DATE_TODAY.matcher(q).find()) {
            dateRange = Optional.of(new InstantRange(now.minus(1, ChronoUnit.DAYS), now));
            q = DATE_TODAY.matcher(q).replaceAll("").trim();
        } else if (DATE_YESTERDAY.matcher(q).find()) {
            dateRange = Optional.of(new InstantRange(now.minus(2, ChronoUnit.DAYS), now.minus(1, ChronoUnit.DAYS)));
            q = DATE_YESTERDAY.matcher(q).replaceAll("").trim();
        } else if (DATE_LAST_WEEK.matcher(q).find()) {
            dateRange = Optional.of(new InstantRange(now.minus(14, ChronoUnit.DAYS), now.minus(7, ChronoUnit.DAYS)));
            q = DATE_LAST_WEEK.matcher(q).replaceAll("").trim();
        } else if (mDay.find()) {
            int days = Integer.parseInt(mDay.group(2));
            dateRange = Optional.of(new InstantRange(now.minus(days + 1, ChronoUnit.DAYS), now.minus(Math.max(0, days - 1), ChronoUnit.DAYS)));
            q = mDay.replaceAll("").trim();
        }
        
        // Extract Duration
        if (DURATION_SHORT.matcher(q).find()) {
            durationRange = Optional.of(new DurationRange(Duration.ZERO, Duration.ofMinutes(20)));
            q = DURATION_SHORT.matcher(q).replaceAll("").trim();
        } else if (DURATION_LONG.matcher(q).find()) {
            durationRange = Optional.of(new DurationRange(Duration.ofMinutes(60), null));
            q = DURATION_LONG.matcher(q).replaceAll("").trim();
        }
        
        // Clean up unparsed words
        q = q.replaceAll("(?i)\\b(from|on|the|a|an|few|some|downloaded|already|exists|same|file|files|ago)\\b", "").trim();
        q = q.replaceAll("\\s+", " ");
        
        List<String> unparsed = new ArrayList<>();
        if (!q.isBlank()) {
            for (String part : q.split(" ")) {
                unparsed.add(part);
            }
        }
        
        return new LocalSearchPlan(
            q.isBlank() ? Optional.empty() : Optional.of(q),
            kinds,
            dateRange,
            sizeRange,
            durationRange,
            states,
            Optional.empty(), // Path scope parsing omitted for simplicity in potato-mode parser
            sortOrder,
            unparsed
        );
    }
}

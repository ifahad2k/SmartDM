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
    
    private static final Pattern DYNAMIC_SIZE_GREATER = Pattern.compile("(?i)\\b(over|above|larger than|greater than|more than|>|>=)\\s*([\\d\\.]+)\\s*([a-zA-Z]+)?\\b");
    private static final Pattern DYNAMIC_SIZE_LESS = Pattern.compile("(?i)\\b(under|below|smaller than|less than|<|<=)\\s*([\\d\\.]+)\\s*([a-zA-Z]+)?\\b");
    private static final Pattern DYNAMIC_SIZE_GENERIC = Pattern.compile("(?i)\\b(large|big|huge)\\b");
    private static final Pattern DYNAMIC_SIZE_SMALL_GENERIC = Pattern.compile("(?i)\\b(small|tiny|mini)\\b");
    
    private static final Pattern DYNAMIC_DURATION_GREATER = Pattern.compile("(?i)\\b(over|above|longer than|more than|>|>=)\\s*(\\d+)\\s*(min|mins|minutes?|hours?|hrs?)\\b");
    private static final Pattern DYNAMIC_DURATION_LESS = Pattern.compile("(?i)\\b(under|below|shorter than|less than|<|<=)\\s*(\\d+)\\s*(min|mins|minutes?|hours?|hrs?)\\b");
    private static final Pattern DURATION_SHORT = Pattern.compile("(?i)\\b(short|not too long)\\b");
    private static final Pattern DURATION_LONG = Pattern.compile("(?i)\\b(long|around an hour)\\b");
    
    private static final Pattern DATE_TODAY = Pattern.compile("(?i)(today)");
    private static final Pattern DATE_YESTERDAY = Pattern.compile("(?i)(yesterday)");
    private static final Pattern DATE_DAYS_AGO = Pattern.compile("(?i)(around\\s+(\\d+)\\s+days?\\s+ago)");
    private static final Pattern DATE_LAST_WEEK = Pattern.compile("(?i)(last\\s+week)");
    private static final Pattern DATE_MINUTES_AGO = Pattern.compile("(?i)((?:few|around|about|\\d+)?\\s*(?:min|mins|minutes?|minitues?|minuts?|minets?)\\s*ago|just\\s+now|recently|recent)");
    private static final Pattern DATE_HOURS_AGO = Pattern.compile("(?i)((?:few|around|about|\\d+)?\\s*(?:hour|hours|hr|hrs)\\s*ago)");

    private static long parseBytes(double val, String unit) {
        if (unit == null || unit.isBlank()) return (long) val;
        String u = unit.toLowerCase();
        long mult = 1L;
        if (u.startsWith("k")) mult = 1024L;
        else if (u.startsWith("m")) mult = 1024L * 1024L;
        else if (u.startsWith("g")) mult = 1024L * 1024L * 1024L;
        else if (u.startsWith("t")) mult = 1024L * 1024L * 1024L * 1024L;
        return (long) (val * mult);
    }

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
        Matcher mSG = DYNAMIC_SIZE_GREATER.matcher(q);
        Matcher mSL = DYNAMIC_SIZE_LESS.matcher(q);
        if (mSG.find()) {
            double val = Double.parseDouble(mSG.group(2));
            String unit = mSG.group(3);
            sizeRange = Optional.of(new LongRange(parseBytes(val, unit), null));
            q = mSG.replaceAll("").trim();
        } else if (mSL.find()) {
            double val = Double.parseDouble(mSL.group(2));
            String unit = mSL.group(3);
            sizeRange = Optional.of(new LongRange(0L, parseBytes(val, unit)));
            q = mSL.replaceAll("").trim();
        } else if (DYNAMIC_SIZE_GENERIC.matcher(q).find()) {
            sizeRange = Optional.of(new LongRange(100L * 1024 * 1024, null));
            q = DYNAMIC_SIZE_GENERIC.matcher(q).replaceAll("").trim();
        } else if (DYNAMIC_SIZE_SMALL_GENERIC.matcher(q).find()) {
            sizeRange = Optional.of(new LongRange(0L, 50L * 1024 * 1024));
            q = DYNAMIC_SIZE_SMALL_GENERIC.matcher(q).replaceAll("").trim();
        }

        Optional<Integer> maxResults = Optional.empty();
        // Extract Ordering / Recency (e.g. "last download", "latest file", "most recent")
        if (q.toLowerCase().matches(".*\\b(last download|last file|latest|most recent|newest)\\b.*") || (q.toLowerCase().matches(".*\\blast\\b.*") && !q.toLowerCase().matches(".*\\blast\\s+(week|month|year|day)s?\\b.*"))) {
            sortOrder = SortOrder.DATE_DESC;
            maxResults = Optional.of(1);
            q = q.replaceAll("(?i)\\b(last download|last file|latest|most recent|newest)\\b", "").trim();
            if (!q.toLowerCase().contains("last week") && !q.toLowerCase().contains("last month")) {
                q = q.replaceAll("(?i)\\blast\\b", "").trim();
            }
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
        Matcher mDG = DYNAMIC_DURATION_GREATER.matcher(q);
        Matcher mDL = DYNAMIC_DURATION_LESS.matcher(q);
        if (mDG.find()) {
            int val = Integer.parseInt(mDG.group(2));
            String unit = mDG.group(3).toLowerCase();
            Duration d = unit.startsWith("h") ? Duration.ofHours(val) : Duration.ofMinutes(val);
            durationRange = Optional.of(new DurationRange(d, null));
            q = mDG.replaceAll("").trim();
        } else if (mDL.find()) {
            int val = Integer.parseInt(mDL.group(2));
            String unit = mDL.group(3).toLowerCase();
            Duration d = unit.startsWith("h") ? Duration.ofHours(val) : Duration.ofMinutes(val);
            durationRange = Optional.of(new DurationRange(Duration.ZERO, d));
            q = mDL.replaceAll("").trim();
        } else if (DURATION_SHORT.matcher(q).find()) {
            durationRange = Optional.of(new DurationRange(Duration.ZERO, Duration.ofMinutes(20)));
            q = DURATION_SHORT.matcher(q).replaceAll("").trim();
        } else if (DURATION_LONG.matcher(q).find()) {
            durationRange = Optional.of(new DurationRange(Duration.ofMinutes(60), null));
            q = DURATION_LONG.matcher(q).replaceAll("").trim();
        }
        
        // Clean up unparsed words and conversational filler phrases
        q = q.replaceAll("(?i)\\b(show\\s+me|find\\s+me|get\\s+me|list\\s+all|search\\b|show\\b|find\\b|get\\b|list\\b|display\\b|i\\s+want|can\\s+you|over|under|above|below|larger|smaller|greater|less|than|from|on|the|a|an|few|some|downloaded|already|exists|same|file|files|ago|mb|gb|kb|tb|mib|gib|kib|tib|min|mins|minutes|hours|hrs|hr)\\b", "").trim();
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
            unparsed,
            maxResults
        );
    }
}

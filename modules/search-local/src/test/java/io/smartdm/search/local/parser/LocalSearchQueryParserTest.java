package io.smartdm.search.local.parser;

import io.smartdm.domain.search.*;
import io.smartdm.domain.DownloadState;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class LocalSearchQueryParserTest {

    private final LocalSearchQueryParser parser = new LocalSearchQueryParser();

    @Test
    void shouldParseBasicKeyword() {
        LocalSearchPlan plan = parser.parse("budget.xlsx");
        assertThat(plan.text()).isPresent().contains("budget.xlsx");
        assertThat(plan.kinds()).isEmpty();
    }

    @Test
    void shouldParseVideoAndDate() {
        LocalSearchPlan plan = parser.parse("video not too long downloaded around 4 days ago");
        
        assertThat(plan.kinds()).containsExactly(FileKind.VIDEO);
        assertThat(plan.mediaDuration()).isPresent();
        assertThat(plan.mediaDuration().get().max().toMinutes()).isEqualTo(20);
        assertThat(plan.dateRange()).isPresent();
        
        // Ensure words like "downloaded" are stripped
        assertThat(plan.text()).isEmpty();
    }

    @Test
    void shouldParseFailedPdfsLastWeek() {
        LocalSearchPlan plan = parser.parse("failed PDFs from last week");
        
        assertThat(plan.kinds()).containsExactly(FileKind.DOCUMENT);
        assertThat(plan.states()).containsExactly(DownloadState.FAILED);
        assertThat(plan.dateRange()).isPresent();
        assertThat(plan.text()).isEmpty();
    }

    @Test
    void shouldParseLargeFiles() {
        LocalSearchPlan plan = parser.parse("large files on D drive");
        
        assertThat(plan.sizeBytes()).isPresent();
        assertThat(plan.sizeBytes().get().min()).isEqualTo(100L * 1024 * 1024);
        assertThat(plan.text()).isPresent().contains("D drive");
    }

    @Test
    void shouldParseRecentVideoQueryWithTypo() {
        LocalSearchPlan plan = parser.parse("video from few 3 minitues ago");
        
        assertThat(plan.kinds()).containsExactly(FileKind.VIDEO);
        assertThat(plan.dateRange()).isPresent();
        assertThat(plan.text()).isEmpty();
    }

    @Test
    void shouldParseDynamicSizeQuery() {
        LocalSearchPlan plan = parser.parse("over 100MB");
        
        assertThat(plan.sizeBytes()).isPresent();
        assertThat(plan.sizeBytes().get().min()).isEqualTo(100L * 1024 * 1024);
        assertThat(plan.text()).isEmpty();
    }
}

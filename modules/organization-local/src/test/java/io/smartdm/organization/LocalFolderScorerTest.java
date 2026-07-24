package io.smartdm.organization;

import io.smartdm.domain.organization.FolderAffinity;
import io.smartdm.domain.organization.FolderSuggestion;
import io.smartdm.domain.repository.FolderAffinityRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

class LocalFolderScorerTest {

    private FolderAffinityRepository affinityRepository;
    private LocalFolderScorer scorer;

    @BeforeEach
    void setUp() {
        affinityRepository = Mockito.mock(FolderAffinityRepository.class);
        scorer = new LocalFolderScorer(null, null, affinityRepository);
    }

    @Test
    void testSystemPathSafetyRejection() {
        assertFalse(CandidateGenerator.isSafeCandidatePath(Path.of("C:\\Windows")));
        assertFalse(CandidateGenerator.isSafeCandidatePath(Path.of("/proc")));
        assertFalse(CandidateGenerator.isSafeCandidatePath(Path.of("/sys")));
        assertFalse(CandidateGenerator.isSafeCandidatePath(Path.of("/etc")));
    }

    @Test
    void testScoringWithPinnedAndRecentChoice(@TempDir Path tempDir) {
        Path candidate = tempDir.resolve("Downloads");
        candidate.toFile().mkdirs();

        FolderAffinity affinity = new FolderAffinity(
                candidate.toAbsolutePath().toString(),
                null,
                "mp4",
                "example.com",
                3,
                System.currentTimeMillis(),
                true,
                false
        );

        when(affinityRepository.findByPath(candidate.toAbsolutePath().toString()))
                .thenReturn(Optional.of(affinity));

        List<FolderSuggestion> suggestions = scorer.scoreCandidates(
                List.of(candidate),
                "video.mp4",
                "video/mp4",
                "example.com",
                1024L
        );

        assertEquals(1, suggestions.size());
        assertTrue(suggestions.get(0).score() > 50.0);
        assertTrue(suggestions.get(0).reason() != null && suggestions.get(0).reason().contains("Pinned favorite folder"));
    }

    @Test
    void testBlacklistedFolderIgnored(@TempDir Path tempDir) {
        Path candidate = tempDir.resolve("Blacklisted");
        candidate.toFile().mkdirs();

        FolderAffinity affinity = new FolderAffinity(
                candidate.toAbsolutePath().toString(),
                null,
                null,
                null,
                0,
                0,
                false,
                true
        );

        when(affinityRepository.findByPath(candidate.toAbsolutePath().toString()))
                .thenReturn(Optional.of(affinity));

        List<FolderSuggestion> suggestions = scorer.scoreCandidates(
                List.of(candidate),
                "file.bin",
                "application/octet-stream",
                null,
                1024L
        );

        assertEquals(0, suggestions.size());
    }
}

package io.smartdm.media.ytdlp;

import io.smartdm.domain.Destination;
import io.smartdm.domain.Download;
import io.smartdm.domain.DownloadEvent;
import io.smartdm.domain.SourceUri;
import io.smartdm.domain.repository.DownloadRepository;
import io.smartdm.media.api.DestinationConflictPolicy;
import io.smartdm.media.api.MediaToolManager;
import io.smartdm.media.api.job.MediaJobDescriptor;
import io.smartdm.media.api.job.MediaJobStatus;
import io.smartdm.media.api.job.MediaJobStore;
import io.smartdm.platform.PlatformDirectories;
import io.smartdm.platform.api.process.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class YtDlpMediaDownloadRunnerTest {

    @TempDir
    Path tempDir;

    private NativeProcessController processController;
    private DownloadRepository downloadRepository;
    private MediaJobStore mediaJobStore;
    private DownloadEvent.Publisher eventPublisher;
    private MediaToolManager toolManager;
    private PlatformDirectories platformDirectories;
    private ExecutorService mediaExecutor;

    private YtDlpMediaDownloadRunner runner;

    @BeforeEach
    void setUp() throws Exception {
        processController = mock(NativeProcessController.class);
        downloadRepository = mock(DownloadRepository.class);
        mediaJobStore = mock(MediaJobStore.class);
        eventPublisher = mock(DownloadEvent.Publisher.class);
        toolManager = mock(MediaToolManager.class);
        platformDirectories = mock(PlatformDirectories.class);

        Path ytDlp = tempDir.resolve("yt-dlp.exe");
        Files.createFile(ytDlp);

        when(toolManager.getYtDlpPath()).thenReturn(Optional.of(ytDlp));
        when(platformDirectories.getCacheDirectory()).thenReturn(tempDir);

        mediaExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "test-media-executor");
            t.setDaemon(true);
            return t;
        });

        runner = new YtDlpMediaDownloadRunner(
                processController,
                downloadRepository,
                mediaJobStore,
                eventPublisher,
                toolManager,
                platformDirectories,
                mediaExecutor,
                Clock.fixed(Instant.now(), ZoneId.systemDefault())
        );
    }

    @AfterEach
    void tearDown() {
        if (runner != null) {
            runner.close();
        }
        if (mediaExecutor != null) {
            mediaExecutor.shutdownNow();
        }
    }

    @Test
    void testResumeAfterPauseClearsOldContextAndStartsSecondProcess() throws Exception {
        Download download = Download.create(
                SourceUri.of("https://example.com/video"),
                Destination.of(tempDir.resolve("video.mp4").toString())
        );

        NativeProcessSession session1 = mock(NativeProcessSession.class);
        CompletableFuture<NativeProcessResult> comp1 = new CompletableFuture<>();
        when(session1.completion()).thenReturn(comp1);
        when(session1.killTree()).thenReturn(CompletableFuture.completedFuture(null));
        when(session1.isAlive()).thenReturn(true);

        when(processController.start(any(), any())).thenReturn(session1);

        // 1. Start download
        runner.startDownload(download, tempDir.resolve("video.mp4"), "https://example.com/video", "best", DestinationConflictPolicy.REPLACE)
                .toCompletableFuture().get();

        // 2. Pause download
        MediaJobDescriptor descriptor = new MediaJobDescriptor(
                download.id(), "https://example.com/video", "best", DestinationConflictPolicy.REPLACE, MediaJobStatus.RUNNING, Instant.now(), Instant.now()
        );
        when(mediaJobStore.find(download.id())).thenReturn(Optional.of(descriptor));

        runner.pauseDownload(download).toCompletableFuture().get();

        // Simulate process 1 exited
        when(session1.isAlive()).thenReturn(false);

        // 3. Resume download -> Should start second process session without throwing MEDIA_JOB_ALREADY_ACTIVE
        NativeProcessSession session2 = mock(NativeProcessSession.class);
        CompletableFuture<NativeProcessResult> comp2 = new CompletableFuture<>();
        when(session2.completion()).thenReturn(comp2);
        when(session2.killTree()).thenReturn(CompletableFuture.completedFuture(null));

        when(processController.start(any(), any())).thenReturn(session2);

        runner.resumeDownload(download).toCompletableFuture().get();

        verify(processController, times(2)).start(any(), any());
    }
}

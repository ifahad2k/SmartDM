using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class HlsStreamingEstimationTests
{
    private const string VodPlaylistWithDecimals = """
        #EXTM3U
        #EXT-X-VERSION:3
        #EXT-X-TARGETDURATION:7
        #EXT-X-MEDIA-SEQUENCE:0
        #EXT-X-PLAYLIST-TYPE:VOD
        #EXTINF:6.006,
        segment0.ts
        #EXTINF:6.006,
        segment1.ts
        #EXTINF:5.500,
        segment2.ts
        #EXTINF:4.488,
        segment3.ts
        #EXT-X-ENDLIST
        """;

    private const string MasterPlaylistWithBw = """
        #EXTM3U
        #EXT-X-VERSION:4
        #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio/prog_index.m3u8"
        #EXT-X-STREAM-INF:BANDWIDTH=3128000,AVERAGE-BANDWIDTH=2500000,RESOLUTION=1920x1080,FRAME-RATE=24.000,AUDIO="audio"
        1080p/prog_index.m3u8
        #EXT-X-STREAM-INF:BANDWIDTH=1800000,AVERAGE-BANDWIDTH=1500000,RESOLUTION=1280x720,FRAME-RATE=24.000,AUDIO="audio"
        720p/prog_index.m3u8
        """;

    [Fact]
    public void ParseTotalDuration_SumsExtInfDurationsAccurately()
    {
        double duration = HlsMediaResolver.ParseTotalDuration(VodPlaylistWithDecimals);
        // 6.006 + 6.006 + 5.500 + 4.488 = 22.0
        Assert.Equal(22.0, duration, precision: 2);
    }

    [Fact]
    public void ParseTotalDuration_FallsBackToTargetDuration_WhenExtInfMissingValues()
    {
        string fallbackPlaylist = """
            #EXTM3U
            #EXT-X-TARGETDURATION:6
            #EXTINF:0,
            seg0.ts
            #EXTINF:0,
            seg1.ts
            #EXTINF:0,
            seg2.ts
            #EXT-X-ENDLIST
            """;
        double duration = HlsMediaResolver.ParseTotalDuration(fallbackPlaylist);
        Assert.Equal(18.0, duration, precision: 1);
    }

    [Fact]
    public void ParseBitrate_ExtractsAverageBandwidth_WhenAvailable()
    {
        long bitrate = HlsMediaResolver.ParseBitrate(MasterPlaylistWithBw);
        // AVERAGE-BANDWIDTH=2500000 should be preferred over BANDWIDTH=3128000
        Assert.Equal(2500000L, bitrate);
    }

    [Fact]
    public void ParseBitrate_ExtractsBandwidth_WhenAverageBandwidthMissing()
    {
        string bwOnly = """
            #EXTM3U
            #EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720
            720p/prog_index.m3u8
            """;
        long bitrate = HlsMediaResolver.ParseBitrate(bwOnly);
        Assert.Equal(1800000L, bitrate);
    }

    [Fact]
    public void ParseBitrate_ExtractsExtXBitrateTag()
    {
        string bitrateTag = """
            #EXTM3U
            #EXT-X-BITRATE:4200
            #EXTINF:6.0,
            chunk.ts
            #EXT-X-ENDLIST
            """;
        long bitrate = HlsMediaResolver.ParseBitrate(bitrateTag);
        Assert.Equal(4200000L, bitrate);
    }

    [Fact]
    public void CalculateExpectedTotalBytes_CalculatesFromDurationAndBandwidth()
    {
        // 2 hours (7200 sec) at 2 Mbps (2,000,000 bps) -> 7200 * 2000000 / 8 = 1,800,000,000 bytes (~1.8 GB)
        long bytes = HlsMediaResolver.CalculateExpectedTotalBytes(7200, 2000000L);
        Assert.Equal(1800000000L, bytes);
    }

    [Fact]
    public void CalculateExpectedTotalBytes_EstimatesFromResolution_WhenBandwidthZero()
    {
        // 1 hour (3600 sec) at 1080p (estimated 3.5 Mbps = 3,500,000 bps) -> 3600 * 3500000 / 8 = 1,575,000,000 bytes
        long bytes = HlsMediaResolver.CalculateExpectedTotalBytes(3600, 0, height: 1080);
        Assert.Equal(1575000000L, bytes);
    }

    [Fact]
    public void CalculateExpectedTotalBytes_EstimatesFromSegmentCount_WhenDurationZero()
    {
        // 100 segments with no duration or bandwidth -> 100 * 2,000,000 = 200,000,000 bytes
        long bytes = HlsMediaResolver.CalculateExpectedTotalBytes(0, 0, 0, segmentCount: 100);
        Assert.Equal(200000000L, bytes);
    }

    [Fact]
    public async Task CapturedHlsPlaylist_CalculatesMetadataAccurately()
    {
        await using var source = new CapturedHlsPlaylist(VodPlaylistWithDecimals, CancellationToken.None);
        Assert.Equal(4, source.SegmentCount);
        Assert.Equal(22.0, source.TotalDuration, precision: 2);
        long expected = source.CalculateExpectedTotalBytes(1080);
        Assert.True(expected > 0, "Expected non-zero calculated bytes for captured playlist");
    }

    [Fact]
    public void ParseMasterManifest_PopulatesBandwidthOnFormats()
    {
        var formats = HlsMediaResolver.ParseMasterManifest(MasterPlaylistWithBw, "https://example.com/master.m3u8");
        Assert.Equal(2, formats.Count);
        Assert.Equal(1080, formats[0].Height);
        Assert.Equal(2500000L, formats[0].Bandwidth);
        Assert.Equal(720, formats[1].Height);
        Assert.Equal(1500000L, formats[1].Bandwidth);
    }

    [Fact]
    public void ParseMasterManifest_PopulatesAudioUrl_FromAudioMediaRendition()
    {
        var formats = HlsMediaResolver.ParseMasterManifest(MasterPlaylistWithBw, "https://example.com/master.m3u8?token=secret123");
        Assert.Equal(2, formats.Count);
        Assert.Equal("https://example.com/audio/prog_index.m3u8?token=secret123", formats[0].AudioUrl);
        Assert.Equal("https://example.com/audio/prog_index.m3u8?token=secret123", formats[1].AudioUrl);
    }

    [Fact]
    public void AddDownloadViewModel_ComputesEffectiveSize_FromDurationAndBandwidth()
    {
        var formats = new List<MediaFormatDto>
        {
            new()
            {
                FormatId = "1080p",
                Resolution = "1080p Full HD",
                Ext = "mp4",
                FileSize = 0,
                Bandwidth = 2500000L,
                TotalDuration = 7200.0,
                DirectUrl = "https://example.com/stream.m3u8",
                MediaKind = "hls"
            }
        };

        var vm = new AddDownloadViewModel(
            initialUrl: "https://example.com/stream.m3u8",
            initialFileName: "Heart of the Beast.mp4",
            initialFormatId: "1080p",
            initialFormats: formats
        );

        Assert.NotNull(vm.SelectedFormat);
        // 7200 * 2500000 / 8 = 2,250,000,000 bytes (~2.09 GB)
        Assert.Equal(2250000000L, vm.SelectedFormat.FileSize);
        Assert.Contains("GB", vm.SelectedFormat.FormattedSize);
    }

    [Fact]
    public void DownloadModel_RetainsBandwidthAndDurationProperties()
    {
        var model = new DownloadModel
        {
            Title = "Heart of the Beast.mp4",
            Url = "https://example.com/stream.m3u8",
            Bandwidth = 2500000L,
            TotalDuration = 7200.0,
            ParallelThreads = 8
        };

        Assert.Equal(2500000L, model.Bandwidth);
        Assert.Equal(7200.0, model.TotalDuration);
        Assert.Equal(8, model.ParallelThreads);
    }

    [Fact]
    public void HlsManifestSnapshot_AcceptsBitrateAndEventPlaylistTags()
    {
        string playlist = """
            #EXTM3U
            #EXT-X-VERSION:4
            #EXT-X-TARGETDURATION:6
            #EXT-X-MEDIA-SEQUENCE:0
            #EXT-X-PLAYLIST-TYPE:EVENT
            #EXT-X-BITRATE:4200000
            #EXT-X-I-FRAMES-ONLY
            #EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"
            #EXTINF:6.0,
            seg0.ts
            #EXT-X-ENDLIST
            """;

        string normalized = HlsManifestSnapshot.Normalize(playlist, "https://moon.goldenkite.top/stream.m3u8");
        Assert.Contains("#EXT-X-BITRATE:4200000", normalized);
        Assert.Contains("#EXT-X-PLAYLIST-TYPE:EVENT", normalized);
        Assert.Contains("https://moon.goldenkite.top/seg0.ts", normalized);
        long br = HlsMediaResolver.ParseBitrate(normalized);
        Assert.Equal(4200000L, br);
    }

    [Fact]
    public void CalculateExpectedTotalBytes_ComputesFromBandwidthAndSegmentCount()
    {
        // 50 segments, 4 Mbps (4,000,000 bps) -> 50 * (4000000 * 8 / 8) = 200,000,000 bytes
        long bytes = HlsMediaResolver.CalculateExpectedTotalBytes(0, 4000000L, 0, segmentCount: 50);
        Assert.Equal(200000000L, bytes);
    }

    [Fact]
    public void GetCandidateReferers_IncludesHostAndAuthorityOrigins()
    {
        var candidates = DownloadEngine.GetCandidateReferers(
            targetUrl: "https://moon.goldenkite.top/hls/1080/segment0.ts",
            primaryReferer: "https://streaming-site.tv/watch/heart-of-the-beast",
            pageUrl: "https://streaming-site.tv/embed/player"
        );

        Assert.Contains("https://streaming-site.tv/watch/heart-of-the-beast", candidates);
        Assert.Contains("https://streaming-site.tv/", candidates);
        Assert.Contains("https://moon.goldenkite.top/", candidates);
        Assert.Contains("https://goldenkite.top/", candidates);
        Assert.Contains("", candidates); // Empty referer for anti-hotlink bypass
    }
}

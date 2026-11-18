using System;
using System.Collections.Generic;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public sealed class MovieStreamingRecoveryTests
{
    [Theory]
    [InlineData("Free Guy (2021)", "Free Guy (2021)")]
    [InlineData("The Musical - RamoFlix - Unlimited Movies & TV Shows Online.mp4", "The Musical")]
    [InlineData("The Musical - RamoFlix - Unlimited Movies & TV Shows Online", "The Musical")]
    [InlineData("Stream Resident Evil (2026) Online Free Watch Full Now HD - HydraHD", "Resident Evil (2026)")]
    [InlineData("Watch Klara and the Sun (2026) Full Movie HD - Wmovies", "Klara and the Sun (2026)")]
    [InlineData("Runner (2026) Online Free Watch Full Now HD - Goojara", "Runner (2026)")]
    [InlineData("Watch The Musical Online Free Full Movie HD - 111Movies", "The Musical")]
    [InlineData("Kuroneko to Majo no Kyoushitsu - EP 24 - The Forbidden Date - Miruro", "Kuroneko to Majo no Kyoushitsu - EP 24 - The Forbidden Date")]
    [InlineData("Watch Black Clover Season 2 Episode 1 Online Free - AnimeNexus", "Black Clover Season 2 Episode 1")]
    [InlineData("Isekai Office Worker Episode 1 English Subbed at AnimeSuge", "Isekai Office Worker Episode 1")]
    [InlineData("Cyberpunk: Edgerunners II Episode 1 English Sub - AniZone", "Cyberpunk_ Edgerunners II Episode 1")]
    [InlineData("Kimetsu no Yaiba Episode 1 English Subbed - AnimePahe", "Kimetsu no Yaiba Episode 1")]
    public void CleanWebTitle_SanitizesMovieBoilerplateAndSeoSpam(string rawTitle, string expectedClean)
    {
        string actual = HttpProbeService.CleanWebTitle(rawTitle);
        Assert.Equal(expectedClean, actual);
    }

    [Theory]
    [InlineData("https://moon.goldenkite.top/stream/index.m3u8", true)]
    [InlineData("https://stellarconductornexus.com/hls/master.m3u8", true)]
    [InlineData("https://drw.jabroni.mov/media/runner.mp4", true)]
    [InlineData("https://shiora.top/hls/chunk.m3u8", true)]
    [InlineData("https://owocdn.top/video.mp4", true)]
    [InlineData("https://111movies.net/embed/video.mp4", true)]
    [InlineData("https://wmovies.nl/stream.m3u8", true)]
    [InlineData("https://clearhoney.sunwaveclear.top/m/strm.m3u8", true)]
    [InlineData("https://api.anime.nexus/hls/01a1025f/master.m3u8", true)]
    [InlineData("https://vault-99.owocdn.top/video/ep1.mp4", true)]
    [InlineData("https://megap.shiora.top/hls/seg1.ts", true)]
    [InlineData("https://anizone.to/embed/vplayer", true)]
    [InlineData("https://cdn.example.com/software-installer.zip", false)]
    public void IsStreamingCdn_AccuratelyIdentifiesMovieStreamingHosts(string url, bool expected)
    {
        bool actual = DownloadEngine.IsStreamingCdn(url);
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("https://moon.goldenkite.top/hls/master.m3u8", 16)]
    [InlineData("https://api.anime.nexus/hls/01a1025f/master.m3u8", 8)]
    [InlineData("https://clearhoney.sunwaveclear.top/m/strm.m3u8", 12)]
    [InlineData("https://megap.shiora.top/hls/stream.m3u8", 2)]
    public void AddDownloadViewModel_KeepsConfiguredWorkers_ForStreamingCdns(string url, int expectedThreads)
    {
        var settings = new AppSettingsModel { MaxParallelSegments = expectedThreads };
        var vm = new AddDownloadViewModel(
            settings: settings,
            initialUrl: url,
            initialFileName: "Episode.mp4"
        );

        Assert.Equal(expectedThreads, vm.ParallelThreads);
    }

    [Theory]
    [InlineData("text/html; charset=utf-8", "<!DOCTYPE html><html>Just a moment...</html>", true)]
    [InlineData("text/html", "<html class=\"challenge-platform\">", true)]
    [InlineData("application/vnd.apple.mpegurl", "#EXTM3U\n#EXT-X-VERSION:3", false)]
    [InlineData("video/mp4", null, false)]
    public void IsHtmlResponse_DetectsBotChallengesAndErrorPages(string? contentType, string? body, bool expected)
    {
        bool actual = DownloadEngine.IsHtmlResponse(contentType, body);
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void GetCandidateReferers_IncludesMovieEmbedHostsAndPageOrigins()
    {
        string targetUrl = "https://drw.jabroni.mov/media/segment_001.ts";
        string pageUrl = "https://ww1.goojara.to/mvpexz";

        var candidates = DownloadEngine.GetCandidateReferers(targetUrl, null, pageUrl);

        Assert.Contains("https://ww1.goojara.to/", candidates);
        Assert.Contains("https://goojara.to/", candidates);
        Assert.Contains("https://drw.jabroni.mov/", candidates);
        Assert.Contains("https://jabroni.mov/", candidates);
    }

    [Fact]
    public void GetCandidateReferers_IncludesAnimeEmbedHostsAndCdnMappings()
    {
        // Miruro / Sunwave
        var miruroCandidates = DownloadEngine.GetCandidateReferers("https://clearhoney.sunwaveclear.top/m/strm.m3u8", null, "https://miruro.to/watch/123/kuroneko");
        Assert.Contains("https://miruro.to/", miruroCandidates);

        // Animepahe / owocdn / kwik
        var paheCandidates = DownloadEngine.GetCandidateReferers("https://vault-99.owocdn.top/stream/video.mp4", null, "https://animepahe.pw/play/456");
        Assert.Contains("https://kwik.cx/", paheCandidates);
        Assert.Contains("https://animepahe.pw/", paheCandidates);

        // Animesuge / shiora / megap
        var sugeCandidates = DownloadEngine.GetCandidateReferers("https://megap.shiora.top/hls/stream.m3u8", null, "https://animesuge.tv/anime/test/ep-1");
        Assert.Contains("https://animesuge.tv/", sugeCandidates);
        Assert.Contains("https://megaplay.buzz/", sugeCandidates);

        // Anime Nexus
        var nexusCandidates = DownloadEngine.GetCandidateReferers("https://api.anime.nexus/hls/ep1.m3u8", null, "https://anime.nexus/watch/01a1");
        Assert.Contains("https://anime.nexus/", nexusCandidates);

        // AniZone
        var anizoneCandidates = DownloadEngine.GetCandidateReferers("https://anizone.to/embed/vplayer", null, "https://anizone.to/anime/cyberpunk/1");
        Assert.Contains("https://anizone.to/", anizoneCandidates);
    }

    [Fact]
    public void SanitizeFileName_CleansSeoSpamFromMediaFileNames()
    {
        var probe = new HttpProbeService();
        string raw = "The Musical - RamoFlix - Unlimited Movies & TV Shows Online.mp4";
        string actual = probe.SanitizeFileName(raw);
        Assert.Equal("The Musical.mp4", actual);
    }

    [Fact]
    public void AddDownloadViewModel_AppendsYearFromStreamingContext()
    {
        var settings = new AppSettingsModel { MaxParallelSegments = 16 };
        var vm = new AddDownloadViewModel(
            settings: settings,
            initialUrl: "https://ramoflix.net/the-musical/",
            initialFileName: "The Musical - RamoFlix - Unlimited Movies & TV Shows Online.mp4",
            initialTitle: "The Musical - RamoFlix - Unlimited Movies & TV Shows Online",
            initialVideoUrl: "https://moon.goldenkite.top/stream-2026/index.m3u8"
        );

        Assert.Equal("The Musical (2026).mp4", vm.FileName);
    }

    [Theory]
    [InlineData("strm", true)]
    [InlineData("video", true)]
    [InlineData("master", true)]
    [InlineData("playlist", true)]
    [InlineData("manifest", true)]
    [InlineData("strm-0", true)]
    [InlineData("seg_1", true)]
    [InlineData("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU", false)]
    [InlineData("Kuroneko to Majo no Kyoushitsu - EP 24 - The Forbidden Date", false)]
    [InlineData("Black Clover Season 2 Episode 1", false)]
    public void IsGenericStem_IdentifiesGenericStreamTokens(string stem, bool expected)
    {
        bool actual = HttpProbeService.IsGenericStem(stem);
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("strm.mp4", true)]
    [InlineData("video.mp4", true)]
    [InlineData("master.m3u8", true)]
    [InlineData("playlist.m3u8", true)]
    [InlineData("1DilkUpXt1hIdnyLzn549OxH2Yr0WgBWMwb9bmwglykU.xlsx", false)]
    [InlineData("Kuroneko to Majo no Kyoushitsu - EP 24 - The Forbidden Date.mp4", false)]
    public void IsGenericName_IdentifiesGenericMediaFiles(string filename, bool expected)
    {
        bool actual = HttpProbeService.IsGenericName(filename);
        Assert.Equal(expected, actual);
    }
}

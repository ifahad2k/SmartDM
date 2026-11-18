using System;
using System.Collections.Generic;
using Avalonia.Media.Imaging;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.DesignData;

internal static class DemoDownloads
{
    public static List<DownloadModel> Create(Func<string, Bitmap?> loadIcon)
    {
        var downloads = new List<DownloadModel>();
        // Reserved strictly for UI preview & automated snapshots
        downloads.Add(new DownloadModel
        {
            Title = "Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso",
            Url = "https://releases.ubuntu.com/24.04/Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso",
            Domain = "releases.ubuntu.com",
            TotalBytes = 6657199308L,
            DownloadedBytes = 5176162385L,
            ProgressPercentage = 77.9,
            SpeedMbps = 84.6,
            Status = DownloadStatus.Active,
            Category = "ISO",
            SecondaryBadge = "TURBO x16",
            IconSource = "/Assets/Icons/disc-blue.png",
            IconBitmap = loadIcon("disc-blue.png"),
            IconBg = "#EAF2FF",
            ParallelThreads = 16,
            ActiveMirrors = 3,
            EtaSeconds = 16,
            StatusDetail = "16 Multi-Socket Chunks",
            SavePath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso"),
            FooterDetail = "Pre-allocated memory space • Safe hash pre-match (SHA-256)",
            FooterRight = "Chunk allocation: 16/16 Connected",
            HttpProtocol = "HTTP/2 TLS 1.3",
            MimeType = "application/x-iso9660-image",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "Apache/2.4.58 (Ubuntu)",
            ETag = "\"66228ba7-18d223c\"",
            Sha256Hash = "a4358a9e7eb22f46215320579e09d17d5e6de6b92f7c030ef7682f71f654b0e9",
            StartedAt = "Today 10:14 PM",
            CompletedAt = "--",
            SmartRule = "by extension (*.iso -> ISO Images)",
            AllocationMethod = "Pre-allocated Sparse (Zero Frag)",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        downloads.Add(new DownloadModel
        {
            Title = "AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip",
            Url = "https://huggingface.co/models/AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip",
            Domain = "huggingface.co/models",
            TotalBytes = 41768878080L,
            DownloadedBytes = 15245864110L,
            ProgressPercentage = 36.5,
            SpeedMbps = 43.8,
            Status = DownloadStatus.Active,
            Category = "ZIP",
            SecondaryBadge = "32 Chunks",
            IconSource = "/Assets/Icons/box-blue.png",
            IconBitmap = loadIcon("box-blue.png"),
            IconBg = "#EAF2FF",
            ParallelThreads = 32,
            ActiveMirrors = 2,
            EtaSeconds = 563,
            StatusDetail = "Hetzner Multi-Mirror Cluster",
            SavePath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip"),
            FooterDetail = "Direct Multi-mirror Hetzner cluster (Active peer mesh)",
            FooterRight = "Segment Write Rate: 720 IOPS",
            HttpProtocol = "HTTP/2 TLS 1.3",
            MimeType = "application/zip",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "cloudflare-nginx",
            ETag = "\"5f8b2a19-9b98020\"",
            Sha256Hash = "8f4e2c91b53e77862a901f4c2847a9501a4e21bc0879f98231c5908e7df01a2b",
            StartedAt = "Today 09:42 PM",
            CompletedAt = "--",
            SmartRule = "by extension (*.zip -> Archives)",
            AllocationMethod = "Sparse Fallocate (Zero Frag)",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        downloads.Add(new DownloadModel
        {
            Title = "Render_Cinematic_Frame_Pass_8K_Master_001.png",
            Url = "https://cdn.motionstorage.net/assets/Render_Cinematic_Frame_Pass_8K_Master_001.png",
            Domain = "cdn.motionstorage.net",
            TotalBytes = 155609088L,
            DownloadedBytes = 155609088L,
            ProgressPercentage = 100,
            SpeedMbps = 0,
            Status = DownloadStatus.Completed,
            Category = "PNG",
            SecondaryBadge = "",
            IconSource = "/Assets/Icons/image-green.png",
            IconBitmap = loadIcon("image-green.png"),
            IconBg = "#E6FBF2",
            ParallelThreads = 8,
            ActiveMirrors = 1,
            EtaSeconds = 0,
            StatusDetail = "Status: Healthy",
            SavePath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "Render_Cinematic_Frame_Pass_8K_Master_001.png"),
            FooterDetail = "Verified clean • Written to local cache",
            FooterRight = "Status: Healthy",
            HttpProtocol = "HTTP/3 QUIC TLS 1.3",
            MimeType = "image/png",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "AmazonS3 / Fastly",
            ETag = "\"90810724-bfbf-4ea9-8d76-574f88e7b931\"",
            Sha256Hash = "3b7194f1c7d23e8095b5c907106e2cf83f8b0561e718b52f440a2f7c0628e932",
            StartedAt = "Today 09:10 PM",
            CompletedAt = "Today 09:12 PM",
            SmartRule = "by extension (*.png -> Media)",
            AllocationMethod = "Standard Buffer Stream",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        downloads.Add(new DownloadModel
        {
            Title = "macOS_Sequoia_15.1_Developer_Restore.dmg",
            Url = "https://swcdn.apple.com/updates/macOS_Sequoia_15.1_Developer_Restore.dmg",
            Domain = "swcdn.apple.com",
            TotalBytes = 15569256448L,
            DownloadedBytes = 8696803328L,
            ProgressPercentage = 55.8,
            SpeedMbps = 0,
            Status = DownloadStatus.Paused,
            Category = "DMG",
            SecondaryBadge = "",
            IconSource = "/Assets/Icons/apple-gray.png",
            IconBitmap = loadIcon("apple-gray.png"),
            IconBg = "#F1F3F6",
            ParallelThreads = 16,
            ActiveMirrors = 1,
            EtaSeconds = 0,
            StatusDetail = "Resumable state valid",
            Subline = "8.10 GB / 14.50 GB (55.8%) • Thread State Suspended (Keep-Alive Header Retained)",
            FooterDetail = "Keep-Alive header retained • Sockets suspended",
            FooterRight = "Resumable state valid",
            HttpProtocol = "HTTP/2 TLS 1.3",
            MimeType = "application/x-apple-diskimage",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "Apple-CDN-Edge/v4.2",
            ETag = "\"swcdn-apple-67b12d\"",
            Sha256Hash = "1a8b94f068c07e32489c7d1e39a045ff826b1d490c68270183e390c5f210d7a4",
            StartedAt = "Today 08:30 PM",
            CompletedAt = "--",
            SmartRule = "by extension (*.dmg -> Software)",
            AllocationMethod = "Pre-allocated Sparse (Zero Frag)",
            AvScannerName = "Windows Defender Engine 1.1.24080"
        });

        downloads.Add(new DownloadModel
        {
            Title = "patch_crack_v2024_setup.exe",
            Url = "https://unverified-thirdparty-cdn.ru/files/patch_crack_v2024_setup.exe",
            Domain = "unverified-thirdparty-cdn.ru",
            TotalBytes = 24117248L,
            DownloadedBytes = 24117248L,
            ProgressPercentage = 100,
            SpeedMbps = 0,
            Status = DownloadStatus.Quarantined,
            Category = "EXE",
            SecondaryBadge = "",
            IconSource = "/Assets/Icons/danger-red.png",
            IconBitmap = loadIcon("danger-red.png"),
            IconBg = "#FDE8E8",
            ParallelThreads = 0,
            ActiveMirrors = 0,
            EtaSeconds = 0,
            StatusDetail = "File locked in isolation sandbox",
            Subline = "Blocked by Local Heuristics • RTLO Disguised Extension",
            FooterDetail = "File locked in isolation sandbox",
            FooterRight = "Execution blocked",
            HttpProtocol = "HTTP/1.1 TLS 1.2",
            MimeType = "application/x-msdos-program",
            AcceptsRanges = "bytes (Multi-part enabled)",
            ServerSoftware = "nginx/1.18.0",
            ETag = "\"malicious-trojan-dropper-v2\"",
            Sha256Hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            StartedAt = "Today 07:15 PM",
            CompletedAt = "Today 07:16 PM",
            SmartRule = "Quarantined by Heuristic Safety Rule",
            AllocationMethod = "Isolated Sandbox Quarantine",
            AvScannerName = "Windows Defender (Threat Quarantined)"
        });

        foreach (var download in downloads)
        {
            download.IsPreview = true;
            download.Id = "preview-" + Guid.NewGuid().ToString("N");
        }
        return downloads;
    }
}

using System;
using System.Collections.Generic;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public static class PreviewTransfers
{
    public const string DisabledMessage = "Preview only — downloads and file changes are disabled.";

    // Old previews could be saved before they had an explicit preview marker.
    // Match their source plus size plus a mock validator, never a filename alone.
    private static readonly Dictionary<string, (long Bytes, string Hash, string ETag)> Legacy = new(StringComparer.OrdinalIgnoreCase)
    {
        ["https://releases.ubuntu.com/24.04/Ubuntu-24.04-LTS-Desktop-Kernel6.8-x86_64.iso"] = (6657199308L, "a4358a9e7eb22f46215320579e09d17d5e6de6b92f7c030ef7682f71f654b0e9", "\"66228ba7-18d223c\""),
        ["https://huggingface.co/models/AI_LLM_Weights_70B_Q4_K_M_Instruct_v2.gguf.zip"] = (41768878080L, "8f4e2c91b53e77862a901f4c2847a9501a4e21bc0879f98231c5908e7df01a2b", "\"5f8b2a19-9b98020\""),
        ["https://cdn.motionstorage.net/assets/Render_Cinematic_Frame_Pass_8K_Master_001.png"] = (155609088L, "3b7194f1c7d23e8095b5c907106e2cf83f8b0561e718b52f440a2f7c0628e932", "\"90810724-bfbf-4ea9-8d76-574f88e7b931\""),
        ["https://swcdn.apple.com/updates/macOS_Sequoia_15.1_Developer_Restore.dmg"] = (15569256448L, "1a8b94f068c07e32489c7d1e39a045ff826b1d490c68270183e390c5f210d7a4", "\"swcdn-apple-67b12d\""),
        ["https://unverified-thirdparty-cdn.ru/files/patch_crack_v2024_setup.exe"] = (24117248L, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "\"malicious-trojan-dropper-v2\""),
    };

    public static bool IsPreview(DownloadModel model) => model.IsPreview || IsPreviewId(model.Id) ||
        (Legacy.TryGetValue(model.Url, out var sample) && sample.Bytes == model.TotalBytes &&
         (sample.Hash == model.Sha256Hash || sample.ETag == model.ETag));

    public static bool IsPreviewId(string id) => id.StartsWith("preview-", StringComparison.Ordinal);

    public static void RequireRealTransfer(DownloadModel model)
    {
        if (IsPreview(model)) throw new InvalidOperationException(DisabledMessage);
    }
}

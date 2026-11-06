using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace SmartDm.Desktop.Avalonia.Services;

public sealed class MediaOutputVerifier(IScannerProcessRunner? runner = null)
{
    private readonly IScannerProcessRunner _runner = runner ?? new ScannerProcessRunner();
    public async Task<bool> VerifyAsync(string verifiedFfmpeg, string output, bool requireVideo, bool requireAudio, CancellationToken token)
    {
        var args = new List<string> { "-hide_banner", "-nostdin", "-v", "error", "-i", output };
        if (requireVideo) args.AddRange(new[] { "-map", "0:v:0" });
        if (requireAudio) args.AddRange(new[] { "-map", "0:a:0" });
        args.AddRange(new[] { "-t", "0.1", "-f", "null", "-" });
        return await _runner.RunAsync(verifiedFfmpeg, args, token) == 0;
    }
}

using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class FileNameDecodingTests
{
    [Theory]
    [InlineData("Ansh%20%282002%29%20Hindi%201080p%20WEBRip%20x264%20AAC%202.0%20ESub%20-%20mkvCinemas.mkv", "Ansh (2002) Hindi 1080p WEBRip x264 AAC 2.0 ESub - mkvCinemas.mkv")]
    [InlineData("..%2F..%2Fsample.zip", "sample.zip")]
    [InlineData("..%5C..%5Csample.zip", "sample.zip")]
    [InlineData("literal%2520name.zip", "literal%20name.zip")]
    public void DecodeOnce_ThenEnforceBasename(string input, string expected)
    {
        Assert.Equal(expected, new HttpProbeService().SanitizeFileName(input));
    }
}

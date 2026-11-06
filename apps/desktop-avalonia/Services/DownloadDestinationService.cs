using System;
using System.IO;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public sealed class DownloadDestinationService(IDatabaseRepository repository)
{
    public static Task DeleteConfirmedFileAsync(DownloadModel model) => Task.Run(() =>
    {
        // A quarantined transfer never owned an existing file at SavePath.
        string? path = model.IsQuarantined ? model.QuarantinePath : model.SavePath;
        if (!string.IsNullOrWhiteSpace(path) && File.Exists(path)) File.Delete(path);
        DownloadEngine.CleanupStagingDirectory(DownloadEngine.GetDownloadStagingDirectory(model.Id));
    });

    public async Task<string> MoveAsync(DownloadModel model, string directory, string name)
    {
        if (model.IsActive || model.IsQuarantined) throw new InvalidOperationException("Pause the download before moving it. Quarantined files cannot be moved here.");
        if (string.IsNullOrWhiteSpace(name) || name is "." or ".." || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name.Contains('/') || name.Contains('\\'))
            throw new ArgumentException("Enter a file name without a directory path.");
        string target = Path.GetFullPath(Path.Combine(directory, name));
        string original = Path.GetFullPath(model.SavePath);
        if (target == original) return target;
        var downloads = await repository.GetAllDownloadsAsync();
        if (downloads.Exists(d => d.Id != model.Id && Path.GetFullPath(d.SavePath) == target))
            throw new IOException("Another download owns this destination.");
        bool moved = false, stagedMoved = false;
        string? stageOriginal = null, stageTarget = null;
        if (!model.IsCompletedFile)
        {
            string root = DownloadEngine.GetDownloadStagingDirectory(model.Id);
            stageOriginal = Path.Combine(root, Path.GetFileName(original));
            stageTarget = Path.Combine(root, name);
        }
        try
        {
        await Task.Run(() =>
        {
            if (!Directory.Exists(Path.GetDirectoryName(target))) throw new DirectoryNotFoundException("Destination folder does not exist.");
            if (File.Exists(target)) throw new IOException("A file already exists at the destination. Choose another name.");
            if (stageTarget != null && stageTarget != stageOriginal && File.Exists(stageTarget)) throw new IOException("A staged file already uses this name.");
            if (stageOriginal != null && stageTarget != stageOriginal && File.Exists(stageOriginal)) { File.Move(stageOriginal, stageTarget!, false); stagedMoved = true; }
            if (File.Exists(original)) { File.Move(original, target, false); moved = true; }
            else if (model.IsCompletedFile) throw new FileNotFoundException("The downloaded file is missing.");
        });
        }
        catch
        {
            if (stagedMoved) await Task.Run(() => File.Move(stageTarget!, stageOriginal!, false));
            throw;
        }
        string title = model.Title;
        model.SavePath = target;
        model.Title = name;
        try { await repository.SaveDownloadAsync(model); }
        catch
        {
            model.SavePath = original; model.Title = title;
            if (moved) await Task.Run(() => File.Move(target, original, false));
            if (stagedMoved) await Task.Run(() => File.Move(stageTarget!, stageOriginal!, false));
            throw;
        }
        return target;
    }
}

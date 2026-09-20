using System;
using System.IO;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;

namespace SmartDm.Desktop.Avalonia.Views;

public enum CollisionResolution
{
    Cancel,
    AutoNumber,
    Overwrite,
    CustomRename
}

public partial class FileCollisionDialog : Window
{
    private string _originalPath = string.Empty;
    private string _autoNumberedPath = string.Empty;
    private string _directory = string.Empty;

    public event Action<CollisionResolution, string>? CollisionResolved;

    public FileCollisionDialog()
    {
        InitializeComponent();
    }

    private void OnTitleBarPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            if (e.Source is Button || (e.Source is Visual visual && visual.FindAncestorOfType<Button>() != null))
            {
                return;
            }

            BeginMoveDrag(e);
        }
    }

    public void LoadCollision(string targetPath, string autoNumberedPath)
    {
        _originalPath = targetPath;
        _autoNumberedPath = autoNumberedPath;
        _directory = Path.GetDirectoryName(targetPath) ?? string.Empty;

        string fileName = Path.GetFileName(targetPath);
        FileNameText.Text = fileName;
        CustomFileNameBox.Text = fileName;
        LiveTargetPreviewText.Text = $"Will save as: {Path.Combine(_directory, fileName)}";

        CustomFileNameBox.PropertyChanged += (s, e) =>
        {
            if (e.Property == TextBox.TextProperty)
            {
                string text = CustomFileNameBox.Text?.Trim() ?? "";
                LiveTargetPreviewText.Text = string.IsNullOrEmpty(text) 
                    ? "Please enter a valid file name" 
                    : $"Will save as: {Path.Combine(_directory, text)}";
            }
        };

        CustomFileNameBox.KeyDown += (s, e) =>
        {
            if (e.Key == global::Avalonia.Input.Key.Enter)
            {
                OnCustomRenameClicked(this, new RoutedEventArgs());
            }
        };

        long fileSize = 0;
        if (File.Exists(targetPath))
        {
            try
            {
                var fi = new FileInfo(targetPath);
                fileSize = fi.Length;
            }
            catch { }
        }

        string sizeStr = FormatBytes(fileSize);
        FilePathText.Text = $"{targetPath} • {sizeStr}";

        string autoNumName = Path.GetFileName(autoNumberedPath);
        AutoNumberPreviewText.Text = $"Saves uniquely as \"{autoNumName}\" without overwriting existing files.";

        // Select suitable icon
        string ext = Path.GetExtension(fileName).ToLowerInvariant();
        string iconPath = ext switch
        {
            ".iso" or ".img" => "disc-blue.png",
            ".zip" or ".rar" or ".7z" or ".tar" or ".gz" => "archive-gray.png",
            ".mp4" or ".mkv" or ".avi" or ".mov" or ".mp3" => "image-green.png",
            ".exe" or ".msi" => "box-blue.png",
            _ => "disc-blue.png"
        };

        try
        {
            var uri = new Uri($"avares://SmartDm.Desktop.Avalonia/Assets/Icons/{iconPath}");
            if (global::Avalonia.Platform.AssetLoader.Exists(uri))
            {
                FileIconImage.Source = new Bitmap(global::Avalonia.Platform.AssetLoader.Open(uri));
            }
        }
        catch { }
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "Unknown size";
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        int digitGroups = (int)(Math.Log10(bytes) / Math.Log10(1024));
        digitGroups = Math.Min(digitGroups, units.Length - 1);
        return $"{bytes / Math.Pow(1024, digitGroups):F2} {units[digitGroups]}";
    }

    private void OnAutoNumberClicked(object? sender, RoutedEventArgs e)
    {
        CollisionResolved?.Invoke(CollisionResolution.AutoNumber, _autoNumberedPath);
        Close();
    }

    private void OnOverwriteClicked(object? sender, RoutedEventArgs e)
    {
        CollisionResolved?.Invoke(CollisionResolution.Overwrite, _originalPath);
        Close();
    }

    private void OnCustomRenameClicked(object? sender, RoutedEventArgs e)
    {
        string customName = CustomFileNameBox.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(customName))
        {
            customName = Path.GetFileName(_originalPath);
        }

        string customPath = Path.Combine(_directory, customName);
        CollisionResolved?.Invoke(CollisionResolution.CustomRename, customPath);
        Close();
    }

    private void OnCancelClicked(object? sender, RoutedEventArgs e)
    {
        CollisionResolved?.Invoke(CollisionResolution.Cancel, _originalPath);
        Close();
    }
}

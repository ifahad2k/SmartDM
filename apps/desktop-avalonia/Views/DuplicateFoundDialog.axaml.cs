using System;
using System.Diagnostics;
using System.IO;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class DuplicateFoundDialog : Window
{
    private CatalogMatch? _match;
    public event Action? DownloadAgainRequested;

    public DuplicateFoundDialog()
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

    public void LoadMatch(CatalogMatch match, string? attemptedUrl = null)
    {
        _match = match;
        FileNameText.Text = match.FileName;
        FilePathText.Text = match.FilePath;
        string sizeStr = FormatBytes(match.FileSize);
        MatchReasonText.Text = $"Drive {match.DriveLetter} • {sizeStr} • {match.MatchReason}";

        // Select suitable icon
        string ext = Path.GetExtension(match.FileName).ToLowerInvariant();
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

    private void OnOpenFileClicked(object? sender, RoutedEventArgs e)
    {
        if (_match != null && File.Exists(_match.FilePath))
        {
            try
            {
                Process.Start(new ProcessStartInfo(_match.FilePath) { UseShellExecute = true });
            }
            catch { }
        }
        Close();
    }

    private void OnOpenLocationClicked(object? sender, RoutedEventArgs e)
    {
        if (_match != null && File.Exists(_match.FilePath))
        {
            try
            {
                if (OperatingSystem.IsWindows())
                {
                    Process.Start("explorer.exe", $"/select,\"{_match.FilePath}\"");
                }
                else
                {
                    string? dir = Path.GetDirectoryName(_match.FilePath);
                    if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                    {
                        Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
                    }
                }
            }
            catch { }
        }
        Close();
    }

    private void OnDownloadAgainClicked(object? sender, RoutedEventArgs e)
    {
        DownloadAgainRequested?.Invoke();
        Close();
    }

    private void OnCancelClicked(object? sender, RoutedEventArgs e)
    {
        Close();
    }
}

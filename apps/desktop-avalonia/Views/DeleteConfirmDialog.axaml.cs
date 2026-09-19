using System;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class DeleteConfirmDialog : Window
{
    private DownloadModel? _download;
    public event Action<DownloadModel, bool>? DeleteConfirmed;

    public DeleteConfirmDialog()
    {
        InitializeComponent();
    }

    public void LoadDownload(DownloadModel download)
    {
        _download = download;
        HeaderPromptText.Text = $"How would you like to delete \"{download.Title}\"?";
        FileNameText.Text = download.Title;
        string sizeStr = FormatBytes(download.TotalBytes);
        FilePathText.Text = string.IsNullOrWhiteSpace(download.SavePath) 
            ? $"{download.Url} • {sizeStr}" 
            : $"{download.SavePath} • {sizeStr}";

        if (download.IconBitmap != null)
        {
            FileIconImage.Source = download.IconBitmap;
        }
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "Unknown size";
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        int digitGroups = (int)(Math.Log10(bytes) / Math.Log10(1024));
        digitGroups = Math.Min(digitGroups, units.Length - 1);
        return $"{bytes / Math.Pow(1024, digitGroups):F2} {units[digitGroups]}";
    }

    private void OnCancelClicked(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private void OnSoftDeleteClicked(object? sender, RoutedEventArgs e)
    {
        if (_download != null)
        {
            DeleteConfirmed?.Invoke(_download, false); // false = soft delete (keep file on disk)
        }
        Close();
    }

    private void OnPermanentDeleteClicked(object? sender, RoutedEventArgs e)
    {
        if (_download != null)
        {
            DeleteConfirmed?.Invoke(_download, true); // true = permanent delete (erase from disk)
        }
        Close();
    }
}

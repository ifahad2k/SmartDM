using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class DeleteConfirmDialog : Window
{
    private DownloadModel? _download;
    public event Action<DownloadModel, bool>? DeleteConfirmed;

    public DeleteConfirmDialog()
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

    public void LoadDownload(DownloadModel download)
    {
        _download = download;
        bool preview = PreviewTransfers.IsPreview(download);
        PermanentDeleteButton.IsVisible = PermanentDeleteExplanation.IsVisible = !preview;
        Grid.SetColumnSpan(SoftDeleteExplanation, preview ? 2 : 1);
        DeleteNotice.Text = preview ? "Preview entry: only history will be removed; no files are changed." : "Permanent deletion cannot be undone";
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

using System;
using System.IO;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class MoveRenameDialog : Window
{
    private DownloadModel? _download;
    public event Action<DownloadModel, string, string>? DestinationChanged;

    public MoveRenameDialog()
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
        FileTitleBanner.Text = download.Title;
        FileNameBox.Text = download.Title;

        string dir = Path.GetDirectoryName(download.SavePath) ?? string.Empty;
        if (string.IsNullOrEmpty(dir))
        {
            dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        }
        FolderPathBox.Text = dir;
    }

    private async void OnBrowseFolderClicked(object? sender, RoutedEventArgs e)
    {
        var topLevel = GetTopLevel(this);
        if (topLevel != null)
        {
            IStorageFolder? startFolder = null;
            try
            {
                if (Directory.Exists(FolderPathBox.Text))
                {
                    startFolder = await topLevel.StorageProvider.TryGetFolderFromPathAsync(FolderPathBox.Text);
                }
            }
            catch { }

            var folders = await topLevel.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
            {
                Title = "Select Destination Folder",
                SuggestedStartLocation = startFolder,
                AllowMultiple = false
            });

            if (folders != null && folders.Count > 0)
            {
                FolderPathBox.Text = folders[0].Path.LocalPath;
            }
        }
    }

    private void OnCancelClicked(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private void OnSaveClicked(object? sender, RoutedEventArgs e)
    {
        string newName = FileNameBox.Text?.Trim() ?? string.Empty;
        string newFolder = FolderPathBox.Text?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(newName))
        {
            StatusMessageText.Text = "Please enter a valid file name.";
            StatusMessageText.Foreground = global::Avalonia.Media.Brushes.OrangeRed;
            return;
        }

        if (string.IsNullOrWhiteSpace(newFolder) || !Directory.Exists(newFolder))
        {
            StatusMessageText.Text = "Destination directory does not exist.";
            StatusMessageText.Foreground = global::Avalonia.Media.Brushes.OrangeRed;
            return;
        }

        if (_download != null)
        {
            string oldPath = _download.SavePath;
            string newPath = Path.Combine(newFolder, newName);

            if (!string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    if (File.Exists(oldPath))
                    {
                        File.Move(oldPath, newPath, true);
                    }
                }
                catch { }

                _download.Title = newName;
                _download.SavePath = newPath;
                DestinationChanged?.Invoke(_download, newName, newPath);
            }
        }

        Close();
    }
}

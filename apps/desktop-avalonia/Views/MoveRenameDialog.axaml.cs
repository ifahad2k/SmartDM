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
    public Func<DownloadModel, string, string, System.Threading.Tasks.Task<string>>? MoveRequested { get; set; }

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

    private async void OnSaveClicked(object? sender, RoutedEventArgs e)
    {
        if (_download == null || MoveRequested == null) return;
        try
        {
            IsEnabled = false;
            string path = await MoveRequested(_download, FolderPathBox.Text?.Trim() ?? "", FileNameBox.Text?.Trim() ?? "");
            DestinationChanged?.Invoke(_download, _download.Title, path);
            Close();
        }
        catch (Exception error)
        {
            StatusMessageText.Text = error.Message;
            StatusMessageText.Foreground = global::Avalonia.Media.Brushes.OrangeRed;
        }
        finally { IsEnabled = true; }
    }
}

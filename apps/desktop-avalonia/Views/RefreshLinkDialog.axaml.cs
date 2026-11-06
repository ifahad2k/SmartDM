using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class RefreshLinkDialog : Window
{
    private DownloadModel? _download;
    public Func<DownloadModel, string, System.Threading.Tasks.Task>? RefreshRequested { get; set; }

    public RefreshLinkDialog()
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
        FileTitleText.Text = download.Title;
        OldUrlBox.Text = download.Url;
    }

    private async void OnPasteClipboardClicked(object? sender, RoutedEventArgs e)
    {
        var topLevel = GetTopLevel(this);
        if (topLevel?.Clipboard != null)
        {
            var text = await topLevel.Clipboard.GetTextAsync();
            if (!string.IsNullOrWhiteSpace(text))
            {
                NewUrlBox.Text = text.Trim();
            }
        }
    }

    private void OnCancelClicked(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void OnUpdateResumeClicked(object? sender, RoutedEventArgs e)
    {
        if (_download == null || RefreshRequested == null) return;
        try
        {
            IsEnabled = false;
            await RefreshRequested(_download, NewUrlBox.Text?.Trim() ?? "");
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

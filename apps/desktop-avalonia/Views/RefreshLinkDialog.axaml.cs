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
    public event Action<DownloadModel, string>? LinkRefreshed;

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

    private void OnUpdateResumeClicked(object? sender, RoutedEventArgs e)
    {
        string freshUrl = NewUrlBox.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(freshUrl) || !Uri.TryCreate(freshUrl, UriKind.Absolute, out _))
        {
            StatusMessageText.Text = "Please enter a valid HTTP/HTTPS download link.";
            StatusMessageText.Foreground = global::Avalonia.Media.Brushes.OrangeRed;
            return;
        }

        if (_download != null)
        {
            _download.Url = freshUrl;
            if (Uri.TryCreate(freshUrl, UriKind.Absolute, out var uri))
            {
                _download.Domain = uri.Host;
            }
            LinkRefreshed?.Invoke(_download, freshUrl);
        }

        Close();
    }
}

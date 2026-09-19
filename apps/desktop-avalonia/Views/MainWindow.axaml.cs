using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void OnCardPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (sender is Control control && control.DataContext is DownloadModel dl && DataContext is MainViewModel vm)
        {
            // Do not intercept if clicking buttons inside card
            if (e.Source is Button || (e.Source is Visual visual && visual.FindAncestorOfType<Button>() != null))
            {
                return;
            }

            vm.SelectDownload(dl);
        }
    }

    private void OnCardDoubleTapped(object? sender, TappedEventArgs e)
    {
        if (sender is Control control && control.DataContext is DownloadModel dl && DataContext is MainViewModel vm)
        {
            if (e.Source is Button || (e.Source is Visual visual && visual.FindAncestorOfType<Button>() != null))
            {
                return;
            }

            if (dl.Status == DownloadStatus.Completed)
            {
                dl.OpenFile();
            }
            else
            {
                vm.OpenMonitor(dl);
            }
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.Key == Key.Delete && DataContext is MainViewModel vm && vm.SelectedDownload != null)
        {
            vm.SelectedDownload.Delete();
            e.Handled = true;
        }
    }

    protected override void OnClosing(WindowClosingEventArgs e)
    {
        if (!App.IsExiting)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnClosing(e);
    }
}

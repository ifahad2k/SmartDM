using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class AddDownloadDialog : Window
{
    public AddDownloadDialog()
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

    public void ShowTransientTopmost()
    {
        Topmost = true;
        WindowState = WindowState.Normal;
        Show();
        Activate();
        Focus();

        if (OperatingSystem.IsWindows())
        {
            try
            {
                var handle = TryGetPlatformHandle()?.Handle;
                if (handle.HasValue && handle.Value != IntPtr.Zero)
                {
                    BringWindowToTop(handle.Value);
                    SetForegroundWindow(handle.Value);
                }
            }
            catch { }
        }

        void OnDeactivated(object? sender, EventArgs e)
        {
            Deactivated -= OnDeactivated;
            try
            {
                Topmost = false;
            }
            catch { }
        }
        Deactivated += OnDeactivated;

        _ = Task.Run(async () =>
        {
            await Task.Delay(350);
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                try
                {
                    Topmost = false;
                }
                catch { }
            });
        });
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        if (DataContext is AddDownloadViewModel vm)
        {
            vm.RequestClose += Close;
            vm.RequestSaveFilePicker = PickSaveFileAsync;
        }
    }

    private async Task<string?> PickSaveFileAsync(string defaultDir, string defaultFileName)
    {
        var topLevel = GetTopLevel(this);
        if (topLevel != null)
        {
            IStorageFolder? startFolder = null;
            try
            {
                if (Directory.Exists(defaultDir))
                {
                    startFolder = await topLevel.StorageProvider.TryGetFolderFromPathAsync(defaultDir);
                }
            }
            catch { }

            var file = await topLevel.StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions
            {
                Title = "Select Destination File Location",
                SuggestedFileName = defaultFileName,
                SuggestedStartLocation = startFolder
            });

            if (file != null)
            {
                return file.Path.LocalPath;
            }
        }
        return null;
    }
}

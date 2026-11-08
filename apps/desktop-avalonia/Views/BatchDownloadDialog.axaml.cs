using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Platform.Storage;
using Avalonia.VisualTree;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class BatchDownloadDialog : Window
{
    public BatchDownloadDialog()
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
                    ShowWindow(handle.Value, 5); // SW_SHOW
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
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.Key == Key.Escape)
        {
            Close();
            e.Handled = true;
        }
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        if (DataContext is BatchDownloadViewModel vm)
        {
            vm.RequestClose += Close;
            vm.RequestFolderPicker = PickFolderAsync;
        }
    }

    private async Task<string?> PickFolderAsync(string currentFolder)
    {
        var topLevel = GetTopLevel(this);
        if (topLevel != null)
        {
            IStorageFolder? startFolder = null;
            try
            {
                string checkDir = currentFolder;
                while (!string.IsNullOrEmpty(checkDir) && !Directory.Exists(checkDir))
                {
                    checkDir = Path.GetDirectoryName(checkDir) ?? string.Empty;
                }
                if (!string.IsNullOrEmpty(checkDir) && Directory.Exists(checkDir))
                {
                    startFolder = await topLevel.StorageProvider.TryGetFolderFromPathAsync(checkDir);
                }
            }
            catch { }

            var folders = await topLevel.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
            {
                Title = "Select Destination Folder for Batch Download",
                SuggestedStartLocation = startFolder,
                AllowMultiple = false
            });

            if (folders != null && folders.Count > 0)
            {
                return folders[0].Path.LocalPath;
            }
        }
        return null;
    }
}

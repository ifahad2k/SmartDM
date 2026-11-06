using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Media.Imaging;
using Avalonia.Styling;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using SmartDm.Desktop.Avalonia.Views;

namespace SmartDm.Desktop.Avalonia;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public static void LogStartup(string msg)
    {
        try
        {
            string dir = AppProfile.DirectoryPath;
            System.IO.Directory.CreateDirectory(dir);
            System.IO.File.AppendAllText(System.IO.Path.Combine(dir, "startup.log"), $"[{DateTime.Now:HH:mm:ss.fff}] {msg}\n");
        }
        catch { }
    }

    public override void OnFrameworkInitializationCompleted()
    {
        LogStartup("OnFrameworkInitializationCompleted ENTER");
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = global::Avalonia.Controls.ShutdownMode.OnExplicitShutdown;
            LogStartup("Set desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown");
            desktop.Exit += (s, e) => LogStartup($"desktop.Exit fired! ExitCode={e.ApplicationExitCode}");

            bool isDemo = desktop.Args != null && (desktop.Args.Contains("--snapshot") || desktop.Args.Contains("--snapshot-settings") || desktop.Args.Contains("--demo"));
            LogStartup($"isDemo={isDemo}, args={(desktop.Args != null ? string.Join(' ', desktop.Args) : "<null>")}");

            // C-04: Do not wipe staging directories blindly before DB is loaded;
            // reconciliation happens safely in MainViewModel.InitializeProductionAsync.
            LogStartup("Starting MainViewModel creation...");
            var mainVm = new MainViewModel(isDemoMode: isDemo);
            LogStartup("MainViewModel created successfully");

            // Apply saved theme preference on launch
            string initialTheme = mainVm.SettingsService?.CurrentSettings?.Theme ?? "System Default";
            if (initialTheme.Equals("Dark", StringComparison.OrdinalIgnoreCase))
                RequestedThemeVariant = ThemeVariant.Dark;
            else if (initialTheme.Equals("Light", StringComparison.OrdinalIgnoreCase))
                RequestedThemeVariant = ThemeVariant.Light;
            else
                RequestedThemeVariant = ThemeVariant.Default;

            LogStartup("Creating MainWindow...");
            MainWindow mainWindow;
            try
            {
                mainWindow = new MainWindow();
                LogStartup("MainWindow instantiated");
                mainWindow.DataContext = mainVm;
                LogStartup("mainWindow.DataContext assigned");
            }
            catch (Exception ex)
            {
                LogStartup($"FATAL EXCEPTION in new MainWindow(): {ex}");
                throw;
            }

            mainWindow.Opened += (s, e) =>
            {
                LogStartup("mainWindow.Opened event fired");
                mainWindow.WindowState = global::Avalonia.Controls.WindowState.Normal;
                mainWindow.Activate();
                mainWindow.Focus();
                if (OperatingSystem.IsWindows())
                {
                    try
                    {
                        var handle = mainWindow.TryGetPlatformHandle()?.Handle;
                        if (handle.HasValue && handle.Value != IntPtr.Zero)
                        {
                            BringWindowToTop(handle.Value);
                            SetForegroundWindow(handle.Value);
                        }
                    }
                    catch { }
                }
            };
            mainWindow.Closing += (s, e) => LogStartup($"mainWindow.Closing event fired. IsCancel={e.Cancel}");

            if (isDemo && desktop.Args != null && (desktop.Args.Contains("--snapshot") || desktop.Args.Contains("--snapshot-settings")))
            {
                mainWindow.Opened += async (_, _) =>
                {
                    await System.Threading.Tasks.Task.Delay(1500);
                    int w = (int)(mainWindow.Bounds.Width > 0 ? mainWindow.Bounds.Width : mainWindow.Width);
                    int h = (int)(mainWindow.Bounds.Height > 0 ? mainWindow.Bounds.Height : mainWindow.Height);
                    if (w <= 0) w = 1120;
                    if (h <= 0) h = 640;

                    string snapshotDirectory = Environment.GetEnvironmentVariable("SMARTDM_SNAPSHOT_DIR")
                        ?? System.IO.Path.Combine(System.IO.Path.GetTempPath(), "SmartDM", "snapshots");
                    System.IO.Directory.CreateDirectory(snapshotDirectory);

                    // 1. Snapshot MainWindow (Light Mode - Clean Queue)
                    var pixelSize = new PixelSize(w, h);
                    using (var rtb = new RenderTargetBitmap(pixelSize, new Vector(96, 96)))
                    {
                        rtb.Render(mainWindow);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_actual.png"));
                    }

                    // 1b. Snapshot MainWindow with Details Inspector Sidebar Open
                    if (mainVm.Downloads.Count > 0)
                    {
                        mainVm.SelectDownload(mainVm.Downloads.First());
                        await System.Threading.Tasks.Task.Delay(300);
                        using (var rtb = new RenderTargetBitmap(pixelSize, new Vector(96, 96)))
                        {
                            rtb.Render(mainWindow);
                            rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_sidebar.png"));
                        }
                        mainVm.CloseDetailsPane();
                        await System.Threading.Tasks.Task.Delay(200);
                    }

                    // 2. Snapshot MainWindow (Dark Mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(pixelSize, new Vector(96, 96)))
                    {
                        rtb.Render(mainWindow);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    await System.Threading.Tasks.Task.Delay(300);

                    // 3. Snapshot AddDownloadDialog
                    var addVm = new AddDownloadViewModel();
                    var addWin = new AddDownloadDialog { DataContext = addVm, Width = 780, Height = 680 };
                    addWin.Show();
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(780, 680), new Vector(96, 96)))
                    {
                        rtb.Render(addWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_add_download.png"));
                    }
                    addWin.Close();

                    // 4. Snapshot TransferMonitorWindow
                    var activeDl = mainVm.Downloads.FirstOrDefault(d => d.IsActive) ?? mainVm.Downloads.First();
                    var monVm = new TransferMonitorViewModel(activeDl);
                    var monWin = new TransferMonitorWindow { DataContext = monVm, Width = 720, Height = 500 };
                    monWin.Show();
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(720, 500), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_transfer_monitor.png"));
                    }

                    // Snapshot TransferMonitorWindow with Custom Limit enabled
                    monVm.SelectedLimitMode = "Custom Limit";
                    monVm.SpeedLimit = 25.0;
                    await System.Threading.Tasks.Task.Delay(300);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(720, 500), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_transfer_monitor_limited.png"));
                    }
                    monVm.SelectedLimitMode = "Max (Unlimited)";
                    await System.Threading.Tasks.Task.Delay(200);

                    // Snapshot TransferMonitorWindow (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(720, 500), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_transfer_monitor_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    await System.Threading.Tasks.Task.Delay(200);

                    // Snapshot expanded details mode
                    monVm.ToggleDetailsCommand.Execute(null);
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(720, 650), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_transfer_monitor_compact.png"));
                    }
                    monWin.Close();

                    // 5. Snapshot CompletionInspectorWindow
                    var compDl = mainVm.Downloads.FirstOrDefault(d => d.IsCompletedFile) ?? mainVm.Downloads.First();
                    var inspVm = new CompletionInspectorViewModel(compDl);
                    var inspWin = new CompletionInspectorWindow { DataContext = inspVm, Width = 720, Height = 500 };
                    inspWin.Show();
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(720, 500), new Vector(96, 96)))
                    {
                        rtb.Render(inspWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_completion_inspector.png"));
                    }
                    inspWin.Close();

                    // 6. Snapshot SettingsWindow (Light & Dark)
                    var setVm = new SettingsViewModel(mainVm.SettingsService);
                    var setWin = new SettingsWindow { DataContext = setVm, Width = 920, Height = 680 };
                    setWin.Show();
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(920, 680), new Vector(96, 96)))
                    {
                        rtb.Render(setWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_settings.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(920, 680), new Vector(96, 96)))
                    {
                        rtb.Render(setWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_settings_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    setWin.Close();

                    // 7. Snapshot RefreshLinkDialog
                    var refreshDl = mainVm.Downloads.First();
                    var refreshWin = new RefreshLinkDialog { Width = 640, Height = 420 };
                    refreshWin.LoadDownload(refreshDl);
                    refreshWin.Show();
                    await System.Threading.Tasks.Task.Delay(500);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(640, 420), new Vector(96, 96)))
                    {
                        rtb.Render(refreshWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_refresh_link.png"));
                    }
                    refreshWin.Close();

                    // 8. Snapshot MoveRenameDialog
                    var moveWin = new MoveRenameDialog { Width = 640, Height = 410 };
                    moveWin.LoadDownload(refreshDl);
                    moveWin.Show();
                    await System.Threading.Tasks.Task.Delay(500);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(640, 410), new Vector(96, 96)))
                    {
                        rtb.Render(moveWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_move_rename.png"));
                    }
                    moveWin.Close();

                    // 9. Snapshot DeleteConfirmDialog (Light & Dark)
                    var deleteDl = mainVm.Downloads.First();
                    var deleteWin = new DeleteConfirmDialog { Width = 640, Height = 430 };
                    deleteWin.LoadDownload(deleteDl);
                    deleteWin.Show();
                    await System.Threading.Tasks.Task.Delay(500);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(640, 430), new Vector(96, 96)))
                    {
                        rtb.Render(deleteWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_delete_confirm.png"));
                    }

                    // DeleteConfirmDialog (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(640, 430), new Vector(96, 96)))
                    {
                        rtb.Render(deleteWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_delete_confirm_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    deleteWin.Close();

                    // 10. Snapshot DuplicateFoundDialog (Light & Dark)
                    var dupDl = mainVm.Downloads.First();
                    var dupWin = new DuplicateFoundDialog { Width = 660, Height = 440 };
                    dupWin.LoadMatch(new CatalogMatch(
                        dupDl.Title,
                        dupDl.SavePath,
                        dupDl.TotalBytes,
                        dupDl.Url,
                        "Exact Download URL & File Name Match",
                        "E:",
                        true
                    ));
                    dupWin.Show();
                    await System.Threading.Tasks.Task.Delay(500);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(660, 440), new Vector(96, 96)))
                    {
                        rtb.Render(dupWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_duplicate_found.png"));
                    }

                    // DuplicateFoundDialog (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(660, 440), new Vector(96, 96)))
                    {
                        rtb.Render(dupWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_duplicate_found_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    dupWin.Close();

                    // 11. Snapshot FileCollisionDialog (Light & Dark)
                    var colWin = new FileCollisionDialog { Width = 660, Height = 480 };
                    colWin.LoadCollision(dupDl.SavePath, mainVm.CatalogService.GenerateUniquePath(dupDl.SavePath));
                    colWin.Show();
                    await System.Threading.Tasks.Task.Delay(500);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(660, 480), new Vector(96, 96)))
                    {
                        rtb.Render(colWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_file_collision.png"));
                    }

                    // FileCollisionDialog (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(660, 480), new Vector(96, 96)))
                    {
                        rtb.Render(colWin);
                        rtb.Save(System.IO.Path.Combine(snapshotDirectory, "smartdm_v2_file_collision_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    colWin.Close();

                    Console.WriteLine("[ALL_SNAPSHOTS_SAVED_SUCCESSFULLY]");
                    desktop.Shutdown();
                };
            }

            _mainWindow = mainWindow;
            _mainVm = mainVm;

            mainVm.RequestThemeChange += isDark =>
            {
                RequestedThemeVariant = isDark ? ThemeVariant.Dark : ThemeVariant.Light;
            };

            mainVm.RequestOpenSettings += () =>
            {
                var settingsVm = new SettingsViewModel(mainVm.SettingsService);
                var settingsWin = new SettingsWindow
                {
                    DataContext = settingsVm
                };
                settingsVm.RequestThemeChange += theme =>
                {
                    if (theme.Equals("Dark", StringComparison.OrdinalIgnoreCase))
                        RequestedThemeVariant = ThemeVariant.Dark;
                    else if (theme.Equals("Light", StringComparison.OrdinalIgnoreCase))
                        RequestedThemeVariant = ThemeVariant.Light;
                    else
                        RequestedThemeVariant = ThemeVariant.Default;
                };
                settingsVm.SettingsSaved += (s, ai) =>
                {
                    mainVm.RefreshEngineMetrics();
                };
                settingsWin.Show(); // INDEPENDENT WINDOW
            };

            AddDownloadDialog? activeAddDialog = null;
            mainVm.RequestOpenAddDialog += (initialUrl, initialFileName, formatId, formats, initialTitle, referer, userAgent, cookies, videoUrl, audioUrl) =>
            {
                if (activeAddDialog != null)
                {
                    try { activeAddDialog.Close(); } catch { }
                    activeAddDialog = null;
                }

                var addVm = new AddDownloadViewModel(
                    mainVm.ProbeService,
                    mainVm.CatalogService,
                    initialUrl,
                    initialFileName,
                    formatId,
                    formats,
                    initialTitle,
                    referer,
                    userAgent,
                    cookies,
                    mainVm.FindActiveDownloadByUrl,
                    mainVm.IsPathInUse,
                    videoUrl,
                    audioUrl,
                    mainVm?.SettingsService?.CurrentSettings);
                var dialog = new AddDownloadDialog
                {
                    DataContext = addVm
                };
                activeAddDialog = dialog;
                dialog.Closed += (s, e) => { if (activeAddDialog == dialog) activeAddDialog = null; };

                addVm.RequestOpenDuplicateDialog += (match, onDownloadAgain) =>
                {
                    try
                    {
                        var dupDialog = new DuplicateFoundDialog();
                        dupDialog.LoadMatch(match, addVm.Url);
                        dupDialog.DownloadAgainRequested += onDownloadAgain;
                        SafeShow(dupDialog, dialog ?? desktop.MainWindow);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[DuplicateDialog] Show error: {ex.Message}");
                    }
                };

                addVm.RequestOpenFileCollisionDialog += (targetPath, autoNumPath, onResolved) =>
                {
                    try
                    {
                        var colDialog = new FileCollisionDialog();
                        colDialog.LoadCollision(targetPath, autoNumPath);
                        colDialog.CollisionResolved += onResolved;
                        SafeShow(colDialog, dialog ?? desktop.MainWindow);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[FileCollisionDialog] Show error: {ex.Message}");
                    }
                };

                addVm.DownloadCreated += newDl =>
                {
                    mainVm.AddNewDownload(newDl);
                    if (newDl.Status != Models.DownloadStatus.Queued)
                    {
                        mainVm.OpenMonitor(newDl);
                    }
                };
                addVm.RequestClose += () =>
                {
                    try { dialog.Close(); } catch { }
                };
                dialog.ShowTransientTopmost();
            };

            mainVm.RequestOpenMonitor += dl =>
            {
                var targetDl = dl ?? mainVm.Downloads.FirstOrDefault(d => d.IsActive) ?? mainVm.Downloads.FirstOrDefault();
                if (targetDl == null) return;
                var monitorVm = new TransferMonitorViewModel(targetDl, mainVm.Engine);
                var monitorWin = new TransferMonitorWindow
                {
                    DataContext = monitorVm
                };
                monitorVm.RequestClose += () =>
                {
                    try { monitorWin.Close(); } catch { }
                };
                monitorVm.RequestCompletionView += completedDl =>
                {
                    try { monitorWin.Close(); } catch { }
                    mainVm.OpenInspectorCommand.Execute(completedDl);
                };
                monitorWin.Closed += (s, e) =>
                {
                    monitorVm.Dispose();
                };
                SafeShow(monitorWin);
            };

            mainVm.RequestOpenInspector += dl =>
            {
                var targetDl = dl ?? mainVm.Downloads.FirstOrDefault(d => d.IsCompletedFile) ?? mainVm.Downloads.FirstOrDefault();
                if (targetDl == null) return;
                var inspectorVm = new CompletionInspectorViewModel(targetDl);
                var inspectorWin = new CompletionInspectorWindow
                {
                    DataContext = inspectorVm
                };
                inspectorVm.RequestClose += () =>
                {
                    try { inspectorWin.Close(); } catch { }
                };
                SafeShow(inspectorWin);
            };

            mainVm.RequestOpenMoveRename += dl =>
            {
                var dialog = new MoveRenameDialog();
                dialog.MoveRequested = (model, folder, name) => mainVm.MoveDownloadAsync(model, folder, name);
                dialog.LoadDownload(dl);
                SafeShow(dialog, desktop.MainWindow);
            };

            mainVm.RequestOpenRefreshLink += dl =>
            {
                var dialog = new RefreshLinkDialog();
                dialog.LoadDownload(dl);
                dialog.RefreshRequested = async (d, newUrl) =>
                {
                    await mainVm.Engine.RefreshDownloadAddressAsync(d, newUrl);
                    await mainVm.Engine.ResumeDownloadAsync(d.Id, d);
                };
                SafeShow(dialog, desktop.MainWindow);
            };

            mainVm.RequestOpenDeleteConfirm += dl =>
            {
                var dialog = new DeleteConfirmDialog();
                dialog.LoadDownload(dl);
                dialog.DeleteConfirmed += (d, deleteOnDisk) =>
                {
                    _ = mainVm.DeleteDownloadAsync(d, deleteOnDisk);
                };
                SafeShow(dialog, desktop.MainWindow);
            };

            LogStartup("Setting desktop.MainWindow...");
            desktop.MainWindow = mainWindow;
            LogStartup("desktop.MainWindow set. NOT calling mainWindow.Show() directly as Avalonia does it automatically.");
        }

        base.OnFrameworkInitializationCompleted();
        LogStartup("OnFrameworkInitializationCompleted EXIT");
    }

    public static bool IsExiting { get; private set; } = false;

    private MainWindow? _mainWindow;
    private MainViewModel? _mainVm;

    public void RestoreMainWindow()
    {
        if (_mainWindow != null)
        {
            _mainWindow.Show();
            _mainWindow.WindowState = global::Avalonia.Controls.WindowState.Normal;
            _mainWindow.Activate();
            _mainWindow.Focus();
            if (OperatingSystem.IsWindows())
            {
                try
                {
                    var handle = _mainWindow.TryGetPlatformHandle()?.Handle;
                    if (handle.HasValue && handle.Value != IntPtr.Zero)
                    {
                        BringWindowToTop(handle.Value);
                        SetForegroundWindow(handle.Value);
                    }
                }
                catch { }
            }
        }
    }

    public static void RestoreCurrentMainWindow()
    {
        (Current as App)?.RestoreMainWindow();
    }

    public static bool IsWindowSafeOwner(Window? window)
    {
        if (window == null) return false;
        try
        {
            var handle = window.TryGetPlatformHandle()?.Handle;
            return window.IsVisible && handle.HasValue && handle.Value != IntPtr.Zero;
        }
        catch
        {
            return false;
        }
    }

    public static void SafeShow(Window window, Window? preferredOwner = null)
    {
        try
        {
            if (preferredOwner != null && IsWindowSafeOwner(preferredOwner))
            {
                try
                {
                    window.Show(preferredOwner);
                    return;
                }
                catch (InvalidOperationException)
                {
                    // Owner was closed or closing during invocation, fall back to ownerless Show()
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[SafeShow] Owner Show failed: {ex.Message}");
                }
            }
            window.Show();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[SafeShow] Window.Show failed: {ex.Message}");
        }
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    public void OnOpenSmartDmClicked(object? sender, EventArgs e) => RestoreMainWindow();
    public void OnAddDownloadClicked(object? sender, EventArgs e) => _mainVm?.OpenAddDialogCommand.Execute(null);
    public void OnActiveTransfersClicked(object? sender, EventArgs e) => _mainVm?.OpenMonitorCommand.Execute(null);
    public void OnSettingsClicked(object? sender, EventArgs e) => _mainVm?.OpenSettingsCommand.Execute(null);
    public void OnToggleThemeClicked(object? sender, EventArgs e) => _mainVm?.ToggleThemeCommand.Execute(null);
    public void OnExitClicked(object? sender, EventArgs e)
    {
        IsExiting = true;
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.Shutdown();
        }
    }
}


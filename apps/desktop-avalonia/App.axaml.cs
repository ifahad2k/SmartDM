using System;
using System.Linq;
using Avalonia;
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

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            bool isDemo = desktop.Args != null && (desktop.Args.Contains("--snapshot") || desktop.Args.Contains("--snapshot-settings") || desktop.Args.Contains("--demo"));
            _ = EngineDaemonLauncher.EnsureDaemonRunningAsync();
            DownloadEngine.CleanupOrphanStagingDirectories();
            var mainVm = new MainViewModel(isDemoMode: isDemo);

            // Apply saved theme preference on launch
            string initialTheme = mainVm.SettingsService?.CurrentSettings?.Theme ?? "System Default";
            if (initialTheme.Equals("Dark", StringComparison.OrdinalIgnoreCase))
                RequestedThemeVariant = ThemeVariant.Dark;
            else if (initialTheme.Equals("Light", StringComparison.OrdinalIgnoreCase))
                RequestedThemeVariant = ThemeVariant.Light;
            else
                RequestedThemeVariant = ThemeVariant.Default;

            var mainWindow = new MainWindow
            {
                DataContext = mainVm
            };

            if (isDemo && desktop.Args != null && (desktop.Args.Contains("--snapshot") || desktop.Args.Contains("--snapshot-settings")))
            {
                mainWindow.Opened += async (_, _) =>
                {
                    await System.Threading.Tasks.Task.Delay(1500);
                    int w = (int)(mainWindow.Bounds.Width > 0 ? mainWindow.Bounds.Width : mainWindow.Width);
                    int h = (int)(mainWindow.Bounds.Height > 0 ? mainWindow.Bounds.Height : mainWindow.Height);
                    if (w <= 0) w = 1120;
                    if (h <= 0) h = 640;

                    string brainDir = @"C:\Users\ifaha\.gemini\antigravity\brain\87d0f223-9f18-4ef3-88a6-b1033d77865f";

                    // 1. Snapshot MainWindow (Light Mode - Clean Queue)
                    var pixelSize = new PixelSize(w, h);
                    using (var rtb = new RenderTargetBitmap(pixelSize, new Vector(96, 96)))
                    {
                        rtb.Render(mainWindow);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_actual.png"));
                    }

                    // 1b. Snapshot MainWindow with Details Inspector Sidebar Open
                    if (mainVm.Downloads.Count > 0)
                    {
                        mainVm.SelectDownload(mainVm.Downloads.First());
                        await System.Threading.Tasks.Task.Delay(300);
                        using (var rtb = new RenderTargetBitmap(pixelSize, new Vector(96, 96)))
                        {
                            rtb.Render(mainWindow);
                            rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_sidebar.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_dark.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_add_download.png"));
                    }
                    addWin.Close();

                    // 4. Snapshot TransferMonitorWindow
                    var activeDl = mainVm.Downloads.FirstOrDefault(d => d.IsActive) ?? mainVm.Downloads.First();
                    var monVm = new TransferMonitorViewModel(activeDl);
                    var monWin = new TransferMonitorWindow { DataContext = monVm, Width = 680, Height = 750 };
                    monWin.Show();
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(680, 750), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_transfer_monitor.png"));
                    }

                    // Snapshot TransferMonitorWindow with Custom Limit enabled
                    monVm.SelectedLimitMode = "Custom Limit";
                    monVm.SpeedLimit = 25.0;
                    await System.Threading.Tasks.Task.Delay(300);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(680, 750), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_transfer_monitor_limited.png"));
                    }
                    monVm.SelectedLimitMode = "Max (Unlimited)";
                    await System.Threading.Tasks.Task.Delay(200);

                    // Snapshot TransferMonitorWindow (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(680, 750), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_transfer_monitor_dark.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Light;
                    await System.Threading.Tasks.Task.Delay(200);

                    // Snapshot compact mode
                    monVm.ToggleDetailsCommand.Execute(null);
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(680, 265), new Vector(96, 96)))
                    {
                        rtb.Render(monWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_transfer_monitor_compact.png"));
                    }
                    monWin.Close();

                    // 5. Snapshot CompletionInspectorWindow
                    var compDl = mainVm.Downloads.FirstOrDefault(d => d.IsCompletedFile) ?? mainVm.Downloads.First();
                    var inspVm = new CompletionInspectorViewModel(compDl);
                    var inspWin = new CompletionInspectorWindow { DataContext = inspVm, Width = 940, Height = 620 };
                    inspWin.Show();
                    await System.Threading.Tasks.Task.Delay(600);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(940, 620), new Vector(96, 96)))
                    {
                        rtb.Render(inspWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_completion_inspector.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_settings.png"));
                    }
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(920, 680), new Vector(96, 96)))
                    {
                        rtb.Render(setWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_settings_dark.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_refresh_link.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_move_rename.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_delete_confirm.png"));
                    }

                    // DeleteConfirmDialog (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(640, 430), new Vector(96, 96)))
                    {
                        rtb.Render(deleteWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_delete_confirm_dark.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_duplicate_found.png"));
                    }

                    // DuplicateFoundDialog (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(660, 440), new Vector(96, 96)))
                    {
                        rtb.Render(dupWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_duplicate_found_dark.png"));
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
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_file_collision.png"));
                    }

                    // FileCollisionDialog (Dark mode)
                    RequestedThemeVariant = ThemeVariant.Dark;
                    await System.Threading.Tasks.Task.Delay(400);
                    using (var rtb = new RenderTargetBitmap(new PixelSize(660, 480), new Vector(96, 96)))
                    {
                        rtb.Render(colWin);
                        rtb.Save(System.IO.Path.Combine(brainDir, "smartdm_v2_file_collision_dark.png"));
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

            mainVm.RequestOpenAddDialog += (initialUrl, initialFileName, formatId, formats, initialTitle, referer, userAgent, cookies) =>
            {
                RestoreMainWindow();
                var addVm = new AddDownloadViewModel(mainVm.ProbeService, mainVm.CatalogService, initialUrl, initialFileName, formatId, formats, initialTitle, referer, userAgent, cookies);
                var dialog = new AddDownloadDialog
                {
                    DataContext = addVm
                };

                addVm.RequestOpenDuplicateDialog += (match, onDownloadAgain) =>
                {
                    var dupDialog = new DuplicateFoundDialog();
                    dupDialog.LoadMatch(match, addVm.Url);
                    dupDialog.DownloadAgainRequested += onDownloadAgain;
                    dupDialog.Show(dialog);
                };

                addVm.RequestOpenFileCollisionDialog += (targetPath, autoNumPath, onResolved) =>
                {
                    var colDialog = new FileCollisionDialog();
                    colDialog.LoadCollision(targetPath, autoNumPath);
                    colDialog.CollisionResolved += onResolved;
                    colDialog.Show(dialog);
                };

                addVm.DownloadCreated += newDl =>
                {
                    mainVm.AddNewDownload(newDl);
                    mainVm.OpenMonitor(newDl);
                };
                addVm.RequestClose += () => dialog.Close();
                dialog.Show(); // INDEPENDENT WINDOW
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
                monitorVm.RequestClose += () => monitorWin.Close();
                monitorVm.RequestCompletionView += completedDl =>
                {
                    monitorWin.Close();
                    mainVm.OpenInspectorCommand.Execute(completedDl);
                };
                monitorWin.Show(); // INDEPENDENT WINDOW
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
                inspectorVm.RequestClose += () => inspectorWin.Close();
                inspectorWin.Show(); // INDEPENDENT WINDOW
            };

            mainVm.RequestOpenMoveRename += dl =>
            {
                var dialog = new MoveRenameDialog();
                dialog.LoadDownload(dl);
                dialog.Show();
            };

            mainVm.RequestOpenRefreshLink += dl =>
            {
                var dialog = new RefreshLinkDialog();
                dialog.LoadDownload(dl);
                dialog.LinkRefreshed += (d, newUrl) =>
                {
                    _ = mainVm.Engine.ResumeDownloadAsync(d.Id, d);
                };
                dialog.Show();
            };

            mainVm.RequestOpenDeleteConfirm += dl =>
            {
                var dialog = new DeleteConfirmDialog();
                dialog.LoadDownload(dl);
                dialog.DeleteConfirmed += (d, deleteOnDisk) =>
                {
                    _ = mainVm.DeleteDownloadAsync(d, deleteOnDisk);
                };
                dialog.Show();
            };

            desktop.MainWindow = mainWindow;
        }

        base.OnFrameworkInitializationCompleted();
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
        }
    }

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


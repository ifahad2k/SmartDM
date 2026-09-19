using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Styling;
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
            var mainVm = new MainViewModel();
            var mainWindow = new MainWindow
            {
                DataContext = mainVm
            };

            mainVm.RequestThemeChange += isDark =>
            {
                RequestedThemeVariant = isDark ? ThemeVariant.Dark : ThemeVariant.Light;
            };

            mainVm.RequestOpenAddDialog += () =>
            {
                var addVm = new AddDownloadViewModel();
                var dialog = new AddDownloadDialog
                {
                    DataContext = addVm
                };
                addVm.DownloadCreated += newDl =>
                {
                    mainVm.Downloads.Insert(0, newDl);
                };
                addVm.RequestClose += () => dialog.Close();
                dialog.ShowDialog(mainWindow);
            };

            mainVm.RequestOpenMonitor += dl =>
            {
                var monitorVm = new TransferMonitorViewModel(dl);
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
                monitorWin.Show(mainWindow);
            };

            mainVm.RequestOpenInspector += dl =>
            {
                var inspectorVm = new CompletionInspectorViewModel(dl);
                var inspectorWin = new CompletionInspectorWindow
                {
                    DataContext = inspectorVm
                };
                inspectorVm.RequestClose += () => inspectorWin.Close();
                inspectorWin.ShowDialog(mainWindow);
            };

            desktop.MainWindow = mainWindow;
        }

        base.OnFrameworkInitializationCompleted();
    }
}

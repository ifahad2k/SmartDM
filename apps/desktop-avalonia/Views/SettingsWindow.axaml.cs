using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Platform.Storage;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class SettingsWindow : Window
{
    public SettingsWindow()
    {
        InitializeComponent();
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        if (DataContext is SettingsViewModel vm)
        {
            vm.RequestClose += Close;
            vm.RequestFolderPicker = PickFolderAsync;
        }
    }

    private async Task<string?> PickFolderAsync()
    {
        var topLevel = GetTopLevel(this);
        if (topLevel != null)
        {
            var folders = await topLevel.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
            {
                Title = "Select Default Download Directory",
                AllowMultiple = false
            });

            if (folders.Count > 0)
            {
                return folders[0].Path.LocalPath;
            }
        }
        return null;
    }
}

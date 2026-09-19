using System;
using System.IO;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Platform.Storage;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class AddDownloadDialog : Window
{
    public AddDownloadDialog()
    {
        InitializeComponent();
    }

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

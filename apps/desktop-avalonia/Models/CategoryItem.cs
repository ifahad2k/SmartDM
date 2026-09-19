using System;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace SmartDm.Desktop.Avalonia.Models;

public partial class CategoryItem : ObservableObject
{
    [ObservableProperty]
    private string _id = string.Empty;

    [ObservableProperty]
    private string _title = string.Empty;

    [ObservableProperty]
    private string _iconSource = string.Empty;

    [ObservableProperty]
    private Bitmap? _iconBitmap;

    [ObservableProperty]
    private int _count;

    [ObservableProperty]
    private bool _isSelected;

    public Action<string>? OnSelectAction { get; set; }

    [RelayCommand]
    public void Select() => OnSelectAction?.Invoke(Id);
}

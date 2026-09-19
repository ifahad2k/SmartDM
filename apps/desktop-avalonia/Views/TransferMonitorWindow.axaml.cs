using System;
using Avalonia.Controls;
using Avalonia.Input;
using SmartDm.Desktop.Avalonia.ViewModels;

namespace SmartDm.Desktop.Avalonia.Views;

public partial class TransferMonitorWindow : Window
{
    public TransferMonitorWindow()
    {
        InitializeComponent();
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        if (DataContext is TransferMonitorViewModel vm)
        {
            vm.RequestClose += Close;
            vm.RequestToggleDetails += show =>
            {
                if (show)
                {
                    MinHeight = 600;
                    Height = 750;
                }
                else
                {
                    MinHeight = 240;
                    Height = 265;
                }
            };
        }
    }

    private void OnTitleBarPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            BeginMoveDrag(e);
        }
    }

    private void OnHeaderPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed && e.Source is not Button)
        {
            BeginMoveDrag(e);
        }
    }
}

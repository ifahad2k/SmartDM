using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.VisualTree;
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
            if (e.Source is Button || (e.Source is Visual visual && visual.FindAncestorOfType<Button>() != null))
            {
                return;
            }

            if (e.ClickCount == 2 && CanResize)
            {
                WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            }
            else
            {
                BeginMoveDrag(e);
            }
        }
    }

    private void OnHeaderPointerPressed(object? sender, PointerPressedEventArgs e)
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
}


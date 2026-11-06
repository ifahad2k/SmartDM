using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Styling;
using Avalonia.Threading;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Controls;

public class SegmentVisualizerControl : Control
{
    public static readonly StyledProperty<IReadOnlyList<ThreadMetric>?> SegmentsProperty =
        AvaloniaProperty.Register<SegmentVisualizerControl, IReadOnlyList<ThreadMetric>?>(nameof(Segments));

    public IReadOnlyList<ThreadMetric>? Segments
    {
        get => GetValue(SegmentsProperty);
        set => SetValue(SegmentsProperty, value);
    }

    private INotifyCollectionChanged? _subscribedCollection;
    private readonly List<INotifyPropertyChanged> _subscribedItems = new();

    static SegmentVisualizerControl()
    {
        AffectsRender<SegmentVisualizerControl>(SegmentsProperty);
    }

    public SegmentVisualizerControl()
    {
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        SubscribeToSegments(Segments);
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        UnsubscribeFromSegments();
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == SegmentsProperty)
        {
            SubscribeToSegments(change.NewValue as IReadOnlyList<ThreadMetric>);
            InvalidateVisual();
        }
    }

    private void SubscribeToSegments(IReadOnlyList<ThreadMetric>? newSegments)
    {
        UnsubscribeFromSegments();

        if (newSegments is INotifyCollectionChanged col)
        {
            _subscribedCollection = col;
            _subscribedCollection.CollectionChanged += OnCollectionChanged;
        }

        if (newSegments != null)
        {
            foreach (var item in newSegments)
            {
                item.PropertyChanged += OnItemPropertyChanged;
                _subscribedItems.Add(item);
            }
        }
    }

    private void UnsubscribeFromSegments()
    {
        if (_subscribedCollection != null)
        {
            _subscribedCollection.CollectionChanged -= OnCollectionChanged;
            _subscribedCollection = null;
        }

        foreach (var item in _subscribedItems)
        {
            item.PropertyChanged -= OnItemPropertyChanged;
        }
        _subscribedItems.Clear();
    }

    private void OnCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (e.OldItems != null)
        {
            foreach (INotifyPropertyChanged item in e.OldItems)
            {
                item.PropertyChanged -= OnItemPropertyChanged;
                _subscribedItems.Remove(item);
            }
        }
        if (e.NewItems != null)
        {
            foreach (INotifyPropertyChanged item in e.NewItems)
            {
                item.PropertyChanged += OnItemPropertyChanged;
                _subscribedItems.Add(item);
            }
        }
        Dispatcher.UIThread.Post(InvalidateVisual, DispatcherPriority.Background);
    }

    private static readonly IBrush CompleteBrush = new LinearGradientBrush
    {
        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
        EndPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
        GradientStops =
        {
            new GradientStop(Color.Parse("#10B981"), 0.0),
            new GradientStop(Color.Parse("#059669"), 1.0)
        }
    };

    private static readonly IBrush DarkActiveBrush = new LinearGradientBrush
    {
        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
        EndPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
        GradientStops =
        {
            new GradientStop(Color.Parse("#38BDF8"), 0.0),
            new GradientStop(Color.Parse("#2563EB"), 1.0)
        }
    };

    private static readonly IBrush LightActiveBrush = new LinearGradientBrush
    {
        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
        EndPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
        GradientStops =
        {
            new GradientStop(Color.Parse("#0284C7"), 0.0),
            new GradientStop(Color.Parse("#1D4ED8"), 1.0)
        }
    };

    private static readonly IBrush DarkIdleBrush = new SolidColorBrush(Color.FromArgb(140, 59, 130, 246));
    private static readonly IBrush LightIdleBrush = new SolidColorBrush(Color.FromArgb(150, 37, 99, 235));
    private static readonly IBrush DarkBgBrush = new SolidColorBrush(Color.Parse("#1A222C"));
    private static readonly IBrush LightBgBrush = new SolidColorBrush(Color.Parse("#E2E8F0"));
    private static readonly IPen DarkBorderPen = new Pen(new SolidColorBrush(Color.Parse("#2D3748")), 1.0);
    private static readonly IPen LightBorderPen = new Pen(new SolidColorBrush(Color.Parse("#CBD5E1")), 1.0);

    private void OnItemPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(ThreadMetric.Progress) ||
            e.PropertyName == nameof(ThreadMetric.IsActive) ||
            e.PropertyName == nameof(ThreadMetric.IsCompleted))
        {
            Dispatcher.UIThread.Post(InvalidateVisual, DispatcherPriority.Background);
        }
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var bounds = Bounds;
        if (bounds.Width <= 20 || bounds.Height <= 4) return;

        var segs = Segments;
        int count = (segs != null && segs.Count > 0) ? segs.Count : 16;
        double gap = 2.0;
        double totalGaps = (count - 1) * gap;
        double slotWidth = Math.Max(2.0, (bounds.Width - totalGaps) / count);
        double cornerRadius = Math.Min(3.0, bounds.Height / 3.0);

        bool isDark = Application.Current?.ActualThemeVariant == ThemeVariant.Dark;
        var bgBrush = isDark ? DarkBgBrush : LightBgBrush;
        var borderPen = isDark ? DarkBorderPen : LightBorderPen;
        var activeBrush = isDark ? DarkActiveBrush : LightActiveBrush;
        var idleFillBrush = isDark ? DarkIdleBrush : LightIdleBrush;

        for (int i = 0; i < count; i++)
        {
            double x = i * (slotWidth + gap);
            var slotRect = new Rect(x, 0, slotWidth, bounds.Height);
            var roundedSlot = new RoundedRect(slotRect, cornerRadius);

            // 1. Slot background & border
            context.DrawRectangle(bgBrush, borderPen, roundedSlot);

            var metric = (segs != null && i < segs.Count) ? segs[i] : null;
            double progress = metric != null ? Math.Clamp(metric.Progress, 0.0, 100.0) : 0.0;
            bool isCompleted = metric != null && (metric.IsCompleted || progress >= 99.9);
            bool isActive = metric != null && metric.IsActive && !isCompleted;

            // 2. Segment progress fill
            if (progress > 0)
            {
                double fillWidth = Math.Clamp(slotWidth * (progress / 100.0), 2.0, slotWidth);
                var fillRect = new Rect(x, 0, fillWidth, bounds.Height);

                using (context.PushClip(roundedSlot))
                {
                    IBrush brush = isCompleted ? CompleteBrush : (isActive ? activeBrush : idleFillBrush);
                    context.DrawRectangle(brush, null, fillRect);
                }
            }
        }
    }
}

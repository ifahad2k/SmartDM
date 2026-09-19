using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;

namespace SmartDm.Desktop.Avalonia.Controls;

public class SparklineControl : Control
{
    public static readonly StyledProperty<IReadOnlyList<double>?> PointsProperty =
        AvaloniaProperty.Register<SparklineControl, IReadOnlyList<double>?>(nameof(Points));

    public static readonly StyledProperty<IBrush?> StrokeBrushProperty =
        AvaloniaProperty.Register<SparklineControl, IBrush?>(nameof(StrokeBrush), new SolidColorBrush(Color.Parse("#3B82F6")));

    public IReadOnlyList<double>? Points
    {
        get => GetValue(PointsProperty);
        set => SetValue(PointsProperty, value);
    }

    public IBrush? StrokeBrush
    {
        get => GetValue(StrokeBrushProperty);
        set => SetValue(StrokeBrushProperty, value);
    }

    private INotifyCollectionChanged? _subscribedCollection;

    static SparklineControl()
    {
        AffectsRender<SparklineControl>(PointsProperty, StrokeBrushProperty);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == PointsProperty)
        {
            if (_subscribedCollection != null)
            {
                _subscribedCollection.CollectionChanged -= OnPointsCollectionChanged;
                _subscribedCollection = null;
            }

            if (change.NewValue is INotifyCollectionChanged newCol)
            {
                _subscribedCollection = newCol;
                _subscribedCollection.CollectionChanged += OnPointsCollectionChanged;
            }

            InvalidateVisual();
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        if (_subscribedCollection == null && Points is INotifyCollectionChanged col)
        {
            _subscribedCollection = col;
            _subscribedCollection.CollectionChanged += OnPointsCollectionChanged;
        }
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        if (_subscribedCollection != null)
        {
            _subscribedCollection.CollectionChanged -= OnPointsCollectionChanged;
            _subscribedCollection = null;
        }
    }

    private void OnPointsCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        Dispatcher.UIThread.Post(InvalidateVisual, DispatcherPriority.Background);
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var bounds = Bounds;
        if (bounds.Width <= 10 || bounds.Height <= 10) return;

        var points = Points;
        if (points == null || points.Count < 2)
        {
            // Draw subtle idle baseline
            var baselinePen = new Pen(new SolidColorBrush(Color.FromArgb(40, 59, 130, 246)), 1.5, new DashStyle(new double[] { 4, 4 }, 0));
            context.DrawLine(baselinePen, new Point(0, bounds.Height - 6), new Point(bounds.Width, bounds.Height - 6));
            return;
        }

        // 1. Dynamic Auto-Scaling (Speed vs Time)
        double maxSpeed = 0.5;
        for (int i = 0; i < points.Count; i++)
        {
            if (points[i] > maxSpeed) maxSpeed = points[i];
        }
        maxSpeed *= 1.25; // 25% vertical breathing room

        // 2. Draw Subtle Horizontal Gridlines (0%, 50%, 100%)
        var gridPen = new Pen(new SolidColorBrush(Color.FromArgb(20, 255, 255, 255)), 1.0, new DashStyle(new double[] { 3, 3 }, 0));
        double midY = bounds.Height / 2.0;
        context.DrawLine(gridPen, new Point(0, midY), new Point(bounds.Width, midY));
        context.DrawLine(gridPen, new Point(0, 4), new Point(bounds.Width, 4));

        double stepX = bounds.Width / (points.Count - 1);
        double bottomY = bounds.Height - 4;

        // 3. Construct Fill Area (Integral of Speed over Time = Total Download)
        var fillGeometry = new StreamGeometry();
        using (var ctx = fillGeometry.Open())
        {
            ctx.BeginFigure(new Point(0, bounds.Height), true);
            for (int i = 0; i < points.Count; i++)
            {
                double x = i * stepX;
                double speed = points[i];
                double normalized = Math.Clamp(speed / maxSpeed, 0.02, 1.0);
                double y = bounds.Height - (normalized * (bounds.Height - 8)) - 4;
                ctx.LineTo(new Point(x, y));
            }
            ctx.LineTo(new Point(bounds.Width, bounds.Height));
        }

        var fillBrush = new LinearGradientBrush
        {
            StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
            EndPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
            GradientStops = new GradientStops
            {
                new GradientStop(Color.FromArgb(90, 59, 130, 246), 0.0),
                new GradientStop(Color.FromArgb(35, 14, 165, 233), 0.5),
                new GradientStop(Color.FromArgb(4, 59, 130, 246), 1.0)
            }
        };
        context.DrawGeometry(fillBrush, null, fillGeometry);

        // 4. Construct Stroke Curve
        var strokeGeometry = new StreamGeometry();
        Point lastPoint = new Point(0, bottomY);
        using (var ctx = strokeGeometry.Open())
        {
            for (int i = 0; i < points.Count; i++)
            {
                double x = i * stepX;
                double speed = points[i];
                double normalized = Math.Clamp(speed / maxSpeed, 0.02, 1.0);
                double y = bounds.Height - (normalized * (bounds.Height - 8)) - 4;
                var pt = new Point(x, y);

                if (i == 0)
                    ctx.BeginFigure(pt, false);
                else
                    ctx.LineTo(pt);

                if (i == points.Count - 1)
                    lastPoint = pt;
            }
        }

        var linePen = new Pen(StrokeBrush ?? new SolidColorBrush(Color.Parse("#38BDF8")), 2.2);
        context.DrawGeometry(null, linePen, strokeGeometry);

        // 5. Draw Glowing Leading Pulse Dot at Latest Speed Position
        var haloBrush = new SolidColorBrush(Color.FromArgb(70, 56, 189, 248));
        context.DrawEllipse(haloBrush, null, lastPoint, 5, 5);

        var dotBrush = new SolidColorBrush(Color.Parse("#38BDF8"));
        context.DrawEllipse(dotBrush, null, lastPoint, 2.5, 2.5);
    }
}

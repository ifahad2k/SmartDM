using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

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

    static SparklineControl()
    {
        AffectsRender<SparklineControl>(PointsProperty, StrokeBrushProperty);
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var bounds = Bounds;
        if (bounds.Width <= 0 || bounds.Height <= 0) return;

        var points = Points;
        if (points == null || points.Count < 2) return;

        double max = 120.0;
        double stepX = bounds.Width / (points.Count - 1);

        var geometry = new StreamGeometry();
        using (var ctx = geometry.Open())
        {
            for (int i = 0; i < points.Count; i++)
            {
                double x = i * stepX;
                double normalized = Math.Clamp(points[i] / max, 0.05, 1.0);
                double y = bounds.Height - (normalized * (bounds.Height - 8)) - 4;

                if (i == 0)
                    ctx.BeginFigure(new Point(x, y), false);
                else
                    ctx.LineTo(new Point(x, y));
            }
        }

        var pen = new Pen(StrokeBrush ?? Brushes.DodgerBlue, 2.0);
        context.DrawGeometry(null, pen, geometry);

        var fillGeometry = new StreamGeometry();
        using (var ctx = fillGeometry.Open())
        {
            ctx.BeginFigure(new Point(0, bounds.Height), true);
            for (int i = 0; i < points.Count; i++)
            {
                double x = i * stepX;
                double normalized = Math.Clamp(points[i] / max, 0.05, 1.0);
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
                new GradientStop(Color.FromArgb(60, 59, 130, 246), 0),
                new GradientStop(Color.FromArgb(0, 59, 130, 246), 1)
            }
        };
        context.DrawGeometry(fillBrush, null, fillGeometry);
    }
}

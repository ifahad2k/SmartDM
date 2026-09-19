using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Styling;

namespace SmartDm.Desktop.Avalonia.Controls;

public class MiniProgressBar : Control
{
    public static readonly StyledProperty<double> ValueProperty =
        AvaloniaProperty.Register<MiniProgressBar, double>(nameof(Value));

    public static readonly StyledProperty<IBrush?> ProgressBrushProperty =
        AvaloniaProperty.Register<MiniProgressBar, IBrush?>(nameof(ProgressBrush));

    public static readonly StyledProperty<IBrush?> TrackBrushProperty =
        AvaloniaProperty.Register<MiniProgressBar, IBrush?>(nameof(TrackBrush));

    static MiniProgressBar()
    {
        AffectsRender<MiniProgressBar>(ValueProperty, ProgressBrushProperty, TrackBrushProperty);
    }

    public double Value
    {
        get => GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public IBrush? ProgressBrush
    {
        get => GetValue(ProgressBrushProperty);
        set => SetValue(ProgressBrushProperty, value);
    }

    public IBrush? TrackBrush
    {
        get => GetValue(TrackBrushProperty);
        set => SetValue(TrackBrushProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var bounds = Bounds;
        if (bounds.Width <= 1 || bounds.Height <= 1) return;

        bool isDark = Application.Current?.ActualThemeVariant == ThemeVariant.Dark;
        double radius = Math.Min(2.0, bounds.Height / 2.0);
        var trackRect = new RoundedRect(new Rect(0, 0, bounds.Width, bounds.Height), radius);

        // 1. Draw track
        var track = TrackBrush ?? (isDark
            ? new SolidColorBrush(Color.Parse("#252E3A"))
            : new SolidColorBrush(Color.Parse("#CBD5E1")));
        context.DrawRectangle(track, null, trackRect);

        // 2. Draw progress fill
        double pct = Math.Clamp(Value, 0.0, 100.0);
        if (pct > 0)
        {
            double fillWidth = Math.Clamp(bounds.Width * (pct / 100.0), bounds.Height, bounds.Width);
            var fillRect = new Rect(0, 0, fillWidth, bounds.Height);

            using (context.PushClip(trackRect))
            {
                IBrush fillBrush;
                if (ProgressBrush != null)
                {
                    fillBrush = ProgressBrush;
                }
                else if (pct >= 99.9)
                {
                    fillBrush = new LinearGradientBrush
                    {
                        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
                        EndPoint = new RelativePoint(1, 0, RelativeUnit.Relative),
                        GradientStops =
                        {
                            new GradientStop(Color.Parse("#10B981"), 0.0),
                            new GradientStop(Color.Parse("#059669"), 1.0)
                        }
                    };
                }
                else
                {
                    fillBrush = new LinearGradientBrush
                    {
                        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
                        EndPoint = new RelativePoint(1, 0, RelativeUnit.Relative),
                        GradientStops =
                        {
                            new GradientStop(isDark ? Color.Parse("#38BDF8") : Color.Parse("#0284C7"), 0.0),
                            new GradientStop(isDark ? Color.Parse("#2563EB") : Color.Parse("#1D4ED8"), 1.0)
                        }
                    };
                }

                context.DrawRectangle(fillBrush, null, fillRect);
            }
        }
    }
}

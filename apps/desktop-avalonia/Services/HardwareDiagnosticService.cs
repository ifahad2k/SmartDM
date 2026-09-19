using System;
using System.IO;
using System.Runtime.InteropServices;

namespace SmartDm.Desktop.Avalonia.Services;

public class HardwareDiagnosticService : IHardwareDiagnosticService
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private class MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;

        public MEMORYSTATUSEX()
        {
            dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX lpBuffer);

    public HardwareDiagnosticResult CheckHardware()
    {
        int cores = Environment.ProcessorCount;
        double totalRamGb = 8.0; // fallback

        try
        {
            if (OperatingSystem.IsWindows())
            {
                var memStatus = new MEMORYSTATUSEX();
                if (GlobalMemoryStatusEx(memStatus))
                {
                    totalRamGb = memStatus.ullTotalPhys / (1024.0 * 1024.0 * 1024.0);
                }
            }
            else if (OperatingSystem.IsLinux() && File.Exists("/proc/meminfo"))
            {
                foreach (var line in File.ReadLines("/proc/meminfo"))
                {
                    if (line.StartsWith("MemTotal:", StringComparison.OrdinalIgnoreCase))
                    {
                        var parts = line.Split(':', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length > 1)
                        {
                            var kbStr = parts[1].Trim().Split(' ')[0];
                            if (long.TryParse(kbStr, out long kb))
                            {
                                totalRamGb = kb / (1024.0 * 1024.0);
                            }
                        }
                        break;
                    }
                }
            }
        }
        catch
        {
            totalRamGb = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024.0 * 1024.0 * 1024.0);
        }

        HardwareSuitabilityLevel suitability;
        string message;
        string model;

        if (totalRamGb >= 14.0)
        {
            suitability = HardwareSuitabilityLevel.Excellent;
            message = $"High Performance: {totalRamGb:F1} GB RAM & {cores} CPU Cores detected. Excellent for 3B/7B quantized local AI models.";
            model = "qwen2.5:3b or llama3.2:3b";
        }
        else if (totalRamGb >= 7.5)
        {
            suitability = HardwareSuitabilityLevel.Moderate;
            message = $"Balanced Performance: {totalRamGb:F1} GB RAM & {cores} CPU Cores detected. 3B 4-bit quantized local models supported.";
            model = "qwen2.5:3b (q4_k_m)";
        }
        else
        {
            suitability = HardwareSuitabilityLevel.Low;
            message = $"Resource Constrained: {totalRamGb:F1} GB RAM. Local AI models may slow down system throughput. Google Gemini free API recommended.";
            model = "Google Gemini API (Cloud) / Disabled";
        }

        return new HardwareDiagnosticResult(totalRamGb, cores, suitability, message, model);
    }
}

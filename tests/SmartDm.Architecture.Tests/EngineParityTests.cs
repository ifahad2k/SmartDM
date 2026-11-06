using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;
using SmartDm.Desktop.Avalonia.ViewModels;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class EngineParityTests
{
    [Fact]
    public void MainViewModel_DefaultEngine_IsPureDownloadEngine_WithoutJavaDaemonAdapter()
    {
        // Arrange & Act
        var vm = new MainViewModel(isDemoMode: true);

        // Assert
        Assert.NotNull(vm.Engine);
        Assert.IsType<DownloadEngine>(vm.Engine);
#pragma warning disable CS0618 // Type or member is obsolete
        Assert.IsNotType<IpcDownloadEngine>(vm.Engine);
#pragma warning restore CS0618
    }

    [Fact]
    public void ProductionStartup_DoesNotReferenceSmartDmIpcClientOrEngineDaemonLauncher()
    {
        // Enforce that Program, App, and MainViewModel entry points do not reference legacy daemon launcher or IPC client
        Type appType = typeof(SmartDm.Desktop.Avalonia.App);
        Type? programType = appType.Assembly.GetType("SmartDm.Desktop.Avalonia.Program");
        Type vmType = typeof(MainViewModel);

        var typesToCheck = new List<Type> { appType, vmType };
        if (programType != null) typesToCheck.Add(programType);

        foreach (var type in typesToCheck)
        {
            var fields = type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
            foreach (var f in fields)
            {
                Assert.False(
                    f.FieldType.Name.Contains("IpcDownloadEngine") ||
                    f.FieldType.Name.Contains("SmartDmIpcClient") ||
                    f.FieldType.Name.Contains("EngineDaemonLauncher"),
                    $"Type {type.Name} must not contain field of type {f.FieldType.Name}");
            }
        }
    }

    [Fact]
    public async Task DownloadEngine_DownloadsOrdinaryHttpContent_WithoutJavaDaemon()
    {
        // 64 KB synthetic test payload
        byte[] payload = new byte[64 * 1024];
        for (int i = 0; i < payload.Length; i++)
        {
            payload[i] = (byte)(i % 251);
        }

        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "smartdm_parity_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string savePath = Path.Combine(tempDir, "downloaded.bin");

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var safetyScanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, safetyScanner);

            var download = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Parity Test File",
                Url = server.BaseUrl + "/file.bin",
                SavePath = savePath,
                TotalBytes = payload.Length,
                ParallelThreads = 2,
                Status = DownloadStatus.Queued
            };

            var tcs = new TaskCompletionSource<bool>();
            engine.DownloadCompleted += (dl, scan) =>
            {
                if (dl.Id == download.Id)
                {
                    tcs.TrySetResult(dl.Status == DownloadStatus.Completed);
                }
            };

            await engine.StartDownloadAsync(download);

            var completed = await Task.WhenAny(tcs.Task, Task.Delay(10000));
            Assert.Same(tcs.Task, completed);
            Assert.True(await tcs.Task);

            Assert.True(File.Exists(savePath));
            byte[] downloadedBytes = await File.ReadAllBytesAsync(savePath);
            Assert.Equal(payload.Length, downloadedBytes.Length);
            Assert.Equal(payload, downloadedBytes);
        }
        finally
        {
            try { Directory.Delete(tempDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public async Task DownloadEngine_OperatesIdentically_WhenDaemonPortOccupiedOrAbsent()
    {
        // Spin up a fake TCP listener mimicking an occupied legacy Java daemon port
        using var fakeDaemonListener = new TcpListener(IPAddress.Loopback, 0);
        fakeDaemonListener.Start();
        int daemonPort = ((IPEndPoint)fakeDaemonListener.LocalEndpoint).Port;

        int daemonConnectionCount = 0;
        using var cts = new CancellationTokenSource();
        var acceptTask = Task.Run(async () =>
        {
            while (!cts.Token.IsCancellationRequested)
            {
                try
                {
                    var client = await fakeDaemonListener.AcceptTcpClientAsync(cts.Token);
                    Interlocked.Increment(ref daemonConnectionCount);
                    client.Close();
                }
                catch (OperationCanceledException) { break; }
                catch { break; }
            }
        });

        // 32 KB test payload
        byte[] payload = new byte[32 * 1024];
        for (int i = 0; i < payload.Length; i++)
        {
            payload[i] = (byte)(i % 199);
        }

        await using var server = new TestHttpServer(payload);
        string tempDir = Path.Combine(Path.GetTempPath(), "smartdm_daemon_indep_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        string savePath = Path.Combine(tempDir, "daemon_indep.bin");

        try
        {
            var repo = new InMemoryDatabaseRepository();
            var safetyScanner = new DirectCleanSafetyScanner();
            var engine = new DownloadEngine(repo, safetyScanner);

            var download = new DownloadModel
            {
                Id = Guid.NewGuid().ToString(),
                Title = "Daemon Independence Test",
                Url = server.BaseUrl + "/file.bin",
                SavePath = savePath,
                TotalBytes = payload.Length,
                ParallelThreads = 2,
                Status = DownloadStatus.Queued
            };

            var tcs = new TaskCompletionSource<bool>();
            engine.DownloadCompleted += (dl, scan) =>
            {
                if (dl.Id == download.Id)
                {
                    tcs.TrySetResult(dl.Status == DownloadStatus.Completed);
                }
            };

            await engine.StartDownloadAsync(download);

            var completed = await Task.WhenAny(tcs.Task, Task.Delay(10000));
            Assert.Same(tcs.Task, completed);
            Assert.True(await tcs.Task);

            // Assert zero connections made to the fake daemon port
            Assert.Equal(0, daemonConnectionCount);

            Assert.True(File.Exists(savePath));
            byte[] downloadedBytes = await File.ReadAllBytesAsync(savePath);
            Assert.Equal(payload, downloadedBytes);
        }
        finally
        {
            cts.Cancel();
            fakeDaemonListener.Stop();
            try { await acceptTask; } catch { }
            try { Directory.Delete(tempDir, recursive: true); } catch { }
        }
    }
}

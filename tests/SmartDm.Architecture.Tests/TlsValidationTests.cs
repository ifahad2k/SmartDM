using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using SmartDm.Desktop.Avalonia.Services;
using Xunit;

namespace SmartDm.Architecture.Tests;

public class TlsValidationTests
{
    [Fact]
    public void HlsMediaResolver_DefaultHandler_HasNoWildcardBypass()
    {
        SocketsHttpHandler handler = HlsMediaResolver.CreateDefaultHandler();

        // Must not have an accept-all callback
        Assert.Null(handler.SslOptions.RemoteCertificateValidationCallback);
    }

    [Fact]
    public async Task HlsMediaResolver_MustFailClosed_OnUntrustedCertificate()
    {
        // Generate an untrusted self-signed certificate in memory
        using RSA rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=localhost-untrusted-test", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        byte[] pfx = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddMinutes(30)).Export(X509ContentType.Pfx);
        using X509Certificate2 serverCert = X509CertificateLoader.LoadPkcs12(pfx, null, X509KeyStorageFlags.Exportable);

        // Start a local HTTPS mock listener
        var tcpListener = new TcpListener(IPAddress.Loopback, 0);
        tcpListener.Start();
        int port = ((IPEndPoint)tcpListener.LocalEndpoint).Port;

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        Task serverTask = Task.Run(async () =>
        {
            try
            {
                using TcpClient client = await tcpListener.AcceptTcpClientAsync(cts.Token);
                using var sslStream = new SslStream(client.GetStream(), false);
                await sslStream.AuthenticateAsServerAsync(serverCert, false, SslProtocols.Tls12 | SslProtocols.Tls13, false);

                using var reader = new StreamReader(sslStream);
                using var writer = new StreamWriter(sslStream) { AutoFlush = true };
                string? line = await reader.ReadLineAsync(cts.Token);
                if (line != null)
                {
                    await writer.WriteAsync("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK");
                }
            }
            catch
            {
                // Expected when client rejects TLS handshake
            }
        });

        try
        {
            // Use the HlsMediaResolver's standard default handler (strict platform TLS validation)
            using var handler = HlsMediaResolver.CreateDefaultHandler();
            using var httpClient = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(4) };

            // Requesting an untrusted self-signed certificate must fail closed
            await Assert.ThrowsAnyAsync<HttpRequestException>(async () =>
            {
                await httpClient.GetStringAsync($"https://127.0.0.1:{port}/playlist.m3u8");
            });
        }
        finally
        {
            cts.Cancel();
            tcpListener.Stop();
            await Task.WhenAny(serverTask, Task.Delay(500));
        }
    }

    [Fact]
    public async Task HlsMediaResolver_Succeeds_WhenCertificateIsExplicitlyTrusted()
    {
        // Generate a test certificate with localhost SAN
        using RSA rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=localhost", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var sanBuilder = new SubjectAlternativeNameBuilder();
        sanBuilder.AddIpAddress(IPAddress.Loopback);
        sanBuilder.AddDnsName("localhost");
        req.CertificateExtensions.Add(sanBuilder.Build());

        byte[] pfx = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddMinutes(30)).Export(X509ContentType.Pfx);
        using X509Certificate2 serverCert = X509CertificateLoader.LoadPkcs12(pfx, null, X509KeyStorageFlags.Exportable);

        var tcpListener = new TcpListener(IPAddress.Loopback, 0);
        tcpListener.Start();
        int port = ((IPEndPoint)tcpListener.LocalEndpoint).Port;

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        Task serverTask = Task.Run(async () =>
        {
            try
            {
                using TcpClient client = await tcpListener.AcceptTcpClientAsync(cts.Token);
                using NetworkStream netStream = client.GetStream();
                using var sslStream = new SslStream(netStream, false);
                await sslStream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                {
                    ServerCertificate = serverCert,
                    ClientCertificateRequired = false
                }, cts.Token);

                using var reader = new StreamReader(sslStream);
                using var writer = new StreamWriter(sslStream, System.Text.Encoding.ASCII) { AutoFlush = true };
                string? line;
                while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync(cts.Token)))
                {
                }

                await writer.WriteAsync("HTTP/1.1 200 OK\r\nContent-Length: 18\r\nConnection: close\r\n\r\n#EXTM3U\n#EXT-X-END\n");
                await writer.FlushAsync(cts.Token);
            }
            catch
            {
            }
        });

        try
        {
            // Verify that when certificate is explicitly trusted by the client handler, transfer succeeds
            using var handler = HlsMediaResolver.CreateDefaultHandler();
            byte[] certBytes = serverCert.Export(X509ContentType.Cert);
            using var trustedCert = X509CertificateLoader.LoadCertificate(certBytes);

            handler.SslOptions.RemoteCertificateValidationCallback = (sender, cert, chain, errors) =>
            {
                return cert != null && cert.GetCertHashString() == trustedCert.GetCertHashString();
            };

            using var httpClient = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(4) };
            string content = await httpClient.GetStringAsync($"https://127.0.0.1:{port}/playlist.m3u8");
            Assert.Contains("#EXTM3U", content);
        }
        finally
        {
            cts.Cancel();
            tcpListener.Stop();
            await Task.WhenAny(serverTask, Task.Delay(500));
        }
    }
}

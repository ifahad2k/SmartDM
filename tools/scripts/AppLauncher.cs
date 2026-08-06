using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;

namespace SmartDM.Launcher
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                if (args.Length > 0 && (args[0].Contains("chrome-extension://") || args[0].Contains("moz-extension://") || args[0].Contains("smartdm@smartdm.io") || args[0].Contains("extension")))
                {
                    RunNativeHost();
                    return;
                }

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string batPath = Path.Combine(baseDir, "bin", "desktop.bat");
                
                if (File.Exists(batPath))
                {
                    string arguments = "/c \"" + batPath + "\"";
                    if (args != null && args.Length > 0)
                    {
                        arguments += " " + string.Join(" ", args);
                    }

                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", arguments)
                    {
                        WorkingDirectory = baseDir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                }
                else
                {
                    MessageBox.Show("SmartDM startup script not found at:\n" + batPath, "SmartDM Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch SmartDM:\n" + ex.Message, "SmartDM Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void RunNativeHost()
        {
            string logFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm", "native_host.log");
            Action<string> log = (msg) => {
                try { File.AppendAllText(logFile, string.Format("[{0:HH:mm:ss}] {1}\n", DateTime.Now, msg)); } catch {}
            };
            
            log("Native host launched!");
            Stream stdin = Console.OpenStandardInput();
            Stream stdout = Console.OpenStandardOutput();
            
            while (true)
            {
                byte[] lengthBytes = new byte[4];
                int bytesRead = stdin.Read(lengthBytes, 0, 4);
                if (bytesRead < 4) {
                    log(string.Format("Exiting, bytesRead for length: {0}", bytesRead));
                    break;
                }
                
                int length = BitConverter.ToInt32(lengthBytes, 0);
                log(string.Format("Received message length: {0}", length));
                if (length <= 0 || length > 10 * 1024 * 1024) {
                    log("Invalid length, exiting");
                    break;
                }
                
                byte[] buffer = new byte[length];
                int totalRead = 0;
                while (totalRead < length)
                {
                    int r = stdin.Read(buffer, totalRead, length - totalRead);
                    if (r <= 0) break;
                    totalRead += r;
                }
                if (totalRead != length) {
                    log(string.Format("Read mismatch: expected {0}, got {1}", length, totalRead));
                    break;
                }
                
                log("Message read successfully. Forwarding to SmartDM IPC...");
                string responseJson = ForwardToSmartDM(buffer, log);
                log(string.Format("Got response from IPC: {0}", responseJson));
                
                byte[] responseBytes = Encoding.UTF8.GetBytes(responseJson);
                byte[] outLen = BitConverter.GetBytes(responseBytes.Length);
                
                stdout.Write(outLen, 0, 4);
                stdout.Write(responseBytes, 0, responseBytes.Length);
                stdout.Flush();
                log("Response sent to Chrome");
            }
        }

        static string ForwardToSmartDM(byte[] payload, Action<string> log)
        {
            string ipcFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm", "ipc.info");
            
            Func<string> tryPost = () => {
                if (!File.Exists(ipcFile)) return null;
                string[] lines = File.ReadAllLines(ipcFile);
                if (lines.Length < 2) return null;
                string port = lines[0].Trim();
                string token = lines[1].Trim();

                WebRequest request = WebRequest.Create("http://127.0.0.1:" + port + "/api/browser");
                request.Method = "POST";
                request.Timeout = 3000;
                request.Headers.Add("Authorization", "Bearer " + token);
                request.ContentType = "application/json";
                request.ContentLength = payload.Length;

                using (Stream reqStream = request.GetRequestStream())
                {
                    reqStream.Write(payload, 0, payload.Length);
                }

                using (WebResponse response = request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    return reader.ReadToEnd();
                }
            };

            try
            {
                string res = tryPost();
                if (res != null) return res;
            }
            catch (Exception ex)
            {
                log("Initial IPC attempt failed: " + ex.Message);
            }

            log("SmartDM process not responding. Auto-starting SmartDM in system tray...");
            EnsureSmartDMRunning(log);

            for (int i = 0; i < 14; i++)
            {
                System.Threading.Thread.Sleep(500);
                try
                {
                    string res = tryPost();
                    if (res != null)
                    {
                        log("IPC connected successfully after auto-start!");
                        return res;
                    }
                }
                catch {}
            }

            return "{\"status\":\"error\",\"message\":\"SmartDM desktop app could not be started.\"}";
        }

        static void EnsureSmartDMRunning(Action<string> log)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string batPath = Path.Combine(baseDir, "bin", "desktop.bat");
                if (File.Exists(batPath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"" + batPath + "\" --autostart")
                    {
                        WorkingDirectory = baseDir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                    log("Auto-launched SmartDM in background system tray");
                }
            }
            catch (Exception ex)
            {
                log("Failed to launch SmartDM background process: " + ex.Message);
            }
        }
    }
}

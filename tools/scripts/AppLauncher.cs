using System;
using System.Diagnostics;
using System.IO;
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
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string batPath = Path.Combine(baseDir, "bin", "desktop.bat");
                
                if (File.Exists(batPath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo(batPath)
                    {
                        WorkingDirectory = baseDir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = true,
                        Arguments = string.Join(" ", args)
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
    }
}

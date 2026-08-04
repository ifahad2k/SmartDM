using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SmartDM.Installer
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }

    public class InstallerForm : Form
    {
        private Label titleLabel;
        private Label statusLabel;
        private ProgressBar progressBar;
        private Button installButton;
        private CheckBox launchCheckBox;

        public InstallerForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "SmartDM v1.0.0 Installer";
            this.Size = new Size(520, 340);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // Modern Dark Theme (#0f172a)

            titleLabel = new Label();
            titleLabel.Text = "Install SmartDM Download Manager";
            titleLabel.Font = new Font("Segoe UI", 14, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(56, 189, 248); // Accent blue (#38bdf8)
            titleLabel.Location = new Point(30, 25);
            titleLabel.Size = new Size(440, 35);
            this.Controls.Add(titleLabel);

            Label subtitleLabel = new Label();
            subtitleLabel.Text = "Includes high-speed download engine and browser extensions.\nTarget directory: C:\\Program Files\\SmartDM\\";
            subtitleLabel.Font = new Font("Segoe UI", 9.5f);
            subtitleLabel.ForeColor = Color.FromArgb(226, 232, 240);
            subtitleLabel.Location = new Point(30, 65);
            subtitleLabel.Size = new Size(440, 45);
            this.Controls.Add(subtitleLabel);

            statusLabel = new Label();
            statusLabel.Text = "Ready to install.";
            statusLabel.Font = new Font("Segoe UI", 9, FontStyle.Italic);
            statusLabel.ForeColor = Color.FromArgb(148, 163, 184);
            statusLabel.Location = new Point(30, 125);
            statusLabel.Size = new Size(440, 25);
            this.Controls.Add(statusLabel);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(30, 155);
            progressBar.Size = new Size(440, 22);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            launchCheckBox = new CheckBox();
            launchCheckBox.Text = "Launch SmartDM after installation";
            launchCheckBox.Checked = true;
            launchCheckBox.Font = new Font("Segoe UI", 9.5f);
            launchCheckBox.ForeColor = Color.FromArgb(226, 232, 240);
            launchCheckBox.Location = new Point(30, 195);
            launchCheckBox.Size = new Size(250, 25);
            this.Controls.Add(launchCheckBox);

            installButton = new Button();
            installButton.Text = "Install Now";
            installButton.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            installButton.ForeColor = Color.White;
            installButton.BackColor = Color.FromArgb(2, 132, 199); // Button Blue
            installButton.FlatStyle = FlatStyle.Flat;
            installButton.FlatAppearance.BorderSize = 0;
            installButton.Location = new Point(290, 235);
            installButton.Size = new Size(180, 42);
            installButton.Cursor = Cursors.Hand;
            installButton.Click += OnInstallClick;
            this.Controls.Add(installButton);
        }

        private async void OnInstallClick(object sender, EventArgs e)
        {
            installButton.Enabled = false;
            progressBar.Visible = true;
            statusLabel.Text = "Extracting SmartDM files to C:\\Program Files\\SmartDM...";
            statusLabel.ForeColor = Color.FromArgb(56, 189, 248);

            string targetDir = @"C:\Program Files\SmartDM";

            try
            {
                await Task.Run(() =>
                {
                    if (!Directory.Exists(targetDir))
                    {
                        Directory.CreateDirectory(targetDir);
                    }

                    // Extract embedded ZIP resource
                    Assembly assembly = Assembly.GetExecutingAssembly();
                    using (Stream stream = assembly.GetManifestResourceStream("payload.zip"))
                    {
                        if (stream != null)
                        {
                            using (ZipArchive archive = new ZipArchive(stream))
                            {
                                foreach (ZipArchiveEntry entry in archive.Entries)
                                {
                                    string destinationPath = Path.Combine(targetDir, entry.FullName);
                                    if (string.IsNullOrEmpty(entry.Name))
                                    {
                                        Directory.CreateDirectory(destinationPath);
                                    }
                                    else
                                    {
                                        string dir = Path.GetDirectoryName(destinationPath);
                                        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                        entry.ExtractToFile(destinationPath, true);
                                    }
                                }
                            }
                        }
                    }

                    // Register Native Messaging Hosts
                    string regBat = Path.Combine(targetDir, "register-native-host.bat");
                    if (File.Exists(regBat))
                    {
                        ProcessStartInfo psi = new ProcessStartInfo(regBat)
                        {
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            WorkingDirectory = targetDir
                        };
                        using (Process p = Process.Start(psi))
                        {
                            p.WaitForExit();
                        }
                    }

                    // Create Desktop Shortcut using Windows Script Host
                    try
                    {
                        Type shellType = Type.GetTypeFromCLSID(new Guid("72C24DD5-D70A-438B-8A42-98424B88AFB8"));
                        dynamic shell = Activator.CreateInstance(shellType);
                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        dynamic shortcut = shell.CreateShortcut(Path.Combine(desktopPath, "SmartDM.lnk"));
                        shortcut.TargetPath = Path.Combine(targetDir, "bin", "desktop.bat");
                        shortcut.WorkingDirectory = targetDir;
                        shortcut.IconLocation = Path.Combine(targetDir, "bin", "desktop.bat") + ",0";
                        shortcut.Save();
                    }
                    catch { }
                });

                progressBar.Visible = false;
                statusLabel.Text = "Installation completed successfully!";
                statusLabel.ForeColor = Color.FromArgb(52, 211, 153); // Success Green

                if (launchCheckBox.Checked)
                {
                    string batPath = Path.Combine(targetDir, "bin", "desktop.bat");
                    if (File.Exists(batPath))
                    {
                        ProcessStartInfo launchInfo = new ProcessStartInfo(batPath)
                        {
                            WorkingDirectory = targetDir,
                            WindowStyle = ProcessWindowStyle.Hidden,
                            UseShellExecute = true
                        };
                        Process.Start(launchInfo);
                    }
                }

                await Task.Delay(1200);
                this.Close();
            }
            catch (Exception ex)
            {
                progressBar.Visible = false;
                statusLabel.Text = "Error: " + ex.Message;
                statusLabel.ForeColor = Color.FromArgb(248, 113, 113);
                installButton.Enabled = true;
            }
        }
    }
}

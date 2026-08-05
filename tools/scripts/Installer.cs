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
        private TextBox pathTextBox;
        private Button browseButton;
        private ProgressBar progressBar;
        private Button installButton;
        private CheckBox launchCheckBox;

        public InstallerForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "SmartDM v1.0.0 Setup";
            this.Size = new Size(540, 390);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // Modern Dark Theme (#0f172a)

            titleLabel = new Label();
            titleLabel.Text = "Install SmartDM Download Manager";
            titleLabel.Font = new Font("Segoe UI", 14, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(56, 189, 248); // Accent blue (#38bdf8)
            titleLabel.Location = new Point(30, 20);
            titleLabel.Size = new Size(460, 35);
            this.Controls.Add(titleLabel);

            Label subtitleLabel = new Label();
            subtitleLabel.Text = "Includes high-speed download engine and browser extensions.";
            subtitleLabel.Font = new Font("Segoe UI", 9.5f);
            subtitleLabel.ForeColor = Color.FromArgb(226, 232, 240);
            subtitleLabel.Location = new Point(30, 60);
            subtitleLabel.Size = new Size(460, 25);
            this.Controls.Add(subtitleLabel);

            Label pathLabel = new Label();
            pathLabel.Text = "Destination Folder:";
            pathLabel.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            pathLabel.ForeColor = Color.FromArgb(148, 163, 184);
            pathLabel.Location = new Point(30, 95);
            pathLabel.Size = new Size(200, 20);
            this.Controls.Add(pathLabel);

            pathTextBox = new TextBox();
            string defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SmartDM");
            pathTextBox.Text = defaultPath;
            pathTextBox.Font = new Font("Segoe UI", 9.5f);
            pathTextBox.BackColor = Color.FromArgb(30, 41, 59);
            pathTextBox.ForeColor = Color.White;
            pathTextBox.BorderStyle = BorderStyle.FixedSingle;
            pathTextBox.Location = new Point(30, 120);
            pathTextBox.Size = new Size(360, 26);
            this.Controls.Add(pathTextBox);

            browseButton = new Button();
            browseButton.Text = "Browse...";
            browseButton.Font = new Font("Segoe UI", 9f);
            browseButton.ForeColor = Color.White;
            browseButton.BackColor = Color.FromArgb(51, 65, 85);
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.FlatAppearance.BorderSize = 0;
            browseButton.Location = new Point(400, 119);
            browseButton.Size = new Size(90, 28);
            browseButton.Cursor = Cursors.Hand;
            browseButton.Click += OnBrowseClick;
            this.Controls.Add(browseButton);

            statusLabel = new Label();
            statusLabel.Text = "Ready to install.";
            statusLabel.Font = new Font("Segoe UI", 9, FontStyle.Italic);
            statusLabel.ForeColor = Color.FromArgb(148, 163, 184);
            statusLabel.Location = new Point(30, 165);
            statusLabel.Size = new Size(460, 25);
            this.Controls.Add(statusLabel);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(30, 195);
            progressBar.Size = new Size(460, 22);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            launchCheckBox = new CheckBox();
            launchCheckBox.Text = "Launch SmartDM after installation";
            launchCheckBox.Checked = true;
            launchCheckBox.Font = new Font("Segoe UI", 9.5f);
            launchCheckBox.ForeColor = Color.FromArgb(226, 232, 240);
            launchCheckBox.Location = new Point(30, 235);
            launchCheckBox.Size = new Size(250, 25);
            this.Controls.Add(launchCheckBox);

            installButton = new Button();
            installButton.Text = "Install Now";
            installButton.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            installButton.ForeColor = Color.White;
            installButton.BackColor = Color.FromArgb(2, 132, 199); // Button Blue
            installButton.FlatStyle = FlatStyle.Flat;
            installButton.FlatAppearance.BorderSize = 0;
            installButton.Location = new Point(310, 275);
            installButton.Size = new Size(180, 42);
            installButton.Cursor = Cursors.Hand;
            installButton.Click += OnInstallClick;
            this.Controls.Add(installButton);
        }

        private void OnBrowseClick(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dlg = new FolderBrowserDialog())
            {
                dlg.Description = "Select installation folder for SmartDM:";
                dlg.SelectedPath = pathTextBox.Text;
                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    pathTextBox.Text = dlg.SelectedPath;
                }
            }
        }

        private async void OnInstallClick(object sender, EventArgs e)
        {
            string targetDir = pathTextBox.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Please enter a valid installation directory.", "Invalid Path", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            installButton.Enabled = false;
            browseButton.Enabled = false;
            pathTextBox.Enabled = false;
            progressBar.Visible = true;
            statusLabel.Text = "Installing SmartDM to " + targetDir + "...";
            statusLabel.ForeColor = Color.FromArgb(56, 189, 248);

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

                    // Create Uninstall script & register Windows Apps & Features Uninstall entry
                    try
                    {
                        string uninstallBat = Path.Combine(targetDir, "uninstall.bat");
                        string uninstallCmd = "@echo off\r\n" +
                            "reg delete \"HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\io.smartdm.host\" /f >nul 2>&1\r\n" +
                            "reg delete \"HKLM\\Software\\Google\\Chrome\\NativeMessagingHosts\\io.smartdm.host\" /f >nul 2>&1\r\n" +
                            "reg delete \"HKCU\\Software\\Mozilla\\NativeMessagingHosts\\io.smartdm.host\" /f >nul 2>&1\r\n" +
                            "reg delete \"HKLM\\Software\\Mozilla\\NativeMessagingHosts\\io.smartdm.host\" /f >nul 2>&1\r\n" +
                            "reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SmartDM\" /f >nul 2>&1\r\n" +
                            "reg delete \"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SmartDM\" /f >nul 2>&1\r\n" +
                            "if exist \"%USERPROFILE%\\Desktop\\SmartDM.lnk\" del /f /q \"%USERPROFILE%\\Desktop\\SmartDM.lnk\" >nul 2>&1\r\n" +
                            "timeout /t 1 >nul\r\n" +
                            "rmdir /s /q \"%~dp0\" >nul 2>&1\r\n";
                        File.WriteAllText(uninstallBat, uninstallCmd);

                        // Register in HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SmartDM
                        using (Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\SmartDM"))
                        {
                            if (key != null)
                            {
                                key.SetValue("DisplayName", "SmartDM Download Manager");
                                key.SetValue("DisplayVersion", "1.0.0");
                                key.SetValue("Publisher", "SmartDM");
                                key.SetValue("InstallLocation", targetDir);
                                key.SetValue("UninstallString", "\"" + uninstallBat + "\"");
                                key.SetValue("DisplayIcon", Path.Combine(targetDir, "SmartDM.exe"));
                            }
                        }
                    }
                    catch { }

                    // Create Desktop Shortcut using Windows Script Host
                    try
                    {
                        Type shellType = Type.GetTypeFromCLSID(new Guid("72C24DD5-D70A-438B-8A42-98424B88AFB8"));
                        dynamic shell = Activator.CreateInstance(shellType);
                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        dynamic shortcut = shell.CreateShortcut(Path.Combine(desktopPath, "SmartDM.lnk"));
                        shortcut.TargetPath = Path.Combine(targetDir, "SmartDM.exe");
                        shortcut.WorkingDirectory = targetDir;
                        shortcut.IconLocation = Path.Combine(targetDir, "SmartDM.exe") + ",0";
                        shortcut.Save();
                    }
                    catch { }
                });

                progressBar.Visible = false;
                statusLabel.Text = "Installation completed successfully!";
                statusLabel.ForeColor = Color.FromArgb(52, 211, 153); // Success Green

                if (launchCheckBox.Checked)
                {
                    string exePath = Path.Combine(targetDir, "SmartDM.exe");
                    if (File.Exists(exePath))
                    {
                        ProcessStartInfo launchInfo = new ProcessStartInfo(exePath)
                        {
                            WorkingDirectory = targetDir,
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
                browseButton.Enabled = true;
                pathTextBox.Enabled = true;
            }
        }
    }
}

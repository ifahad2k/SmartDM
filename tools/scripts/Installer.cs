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
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

        // Step Panels
        private Panel step1Panel; // EULA & Privacy Policy
        private Panel step2Panel; // Install Location & Options
        private Panel step3Panel; // Progress
        private Panel step4Panel; // Finished

        // Footer Navigation Controls
        private Button backButton;
        private Button nextButton;
        private Button cancelButton;

        // Step 1 Controls
        private CheckBox acceptCheckBox;

        // Step 2 Controls
        private TextBox pathTextBox;
        private Button browseButton;
        private CheckBox desktopShortcutCheckBox;
        private CheckBox startupCheckBox;
        private CheckBox browserIntegrationCheckBox;

        // Step 3 Controls
        private Label progressTitleLabel;
        private Label progressStatusLabel;
        private ProgressBar progressBar;

        // Step 4 Controls
        private CheckBox launchCheckBox;

        private int currentStep = 0;

        public InstallerForm()
        {
            InitializeComponent();
            ApplyDarkModeTitlebar();
            ShowStep(0);
        }

        private void ApplyDarkModeTitlebar()
        {
            try
            {
                int darkMode = 1;
                if (DwmSetWindowAttribute(this.Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int)) != 0)
                {
                    DwmSetWindowAttribute(this.Handle, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref darkMode, sizeof(int));
                }
            }
            catch { }
        }

        private void InitializeComponent()
        {
            this.Text = "SmartDM v__APP_VERSION__ Setup";
            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            this.Size = new Size(620, 460);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = Color.FromArgb(15, 23, 42); // Modern Dark Slate (#0f172a)
            this.ForeColor = Color.FromArgb(241, 245, 249);

            // --- Footer Navigation Panel ---
            Panel footerPanel = new Panel();
            footerPanel.Dock = DockStyle.Bottom;
            footerPanel.Height = 65;
            footerPanel.BackColor = Color.FromArgb(30, 41, 59); // Dark Slate Accent (#1e293b)
            this.Controls.Add(footerPanel);

            cancelButton = new Button();
            cancelButton.Text = "Cancel";
            cancelButton.Font = new Font("Segoe UI", 9.5f);
            cancelButton.ForeColor = Color.FromArgb(203, 213, 225);
            cancelButton.BackColor = Color.FromArgb(51, 65, 85);
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.FlatAppearance.BorderSize = 0;
            cancelButton.Size = new Size(95, 36);
            cancelButton.Location = new Point(495, 14);
            cancelButton.Cursor = Cursors.Hand;
            cancelButton.Click += (s, e) => this.Close();
            footerPanel.Controls.Add(cancelButton);

            nextButton = new Button();
            nextButton.Text = "Next >";
            nextButton.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            nextButton.ForeColor = Color.White;
            nextButton.BackColor = Color.FromArgb(2, 132, 199); // Primary Cyan Blue (#0284c7)
            nextButton.FlatStyle = FlatStyle.Flat;
            nextButton.FlatAppearance.BorderSize = 0;
            nextButton.Size = new Size(110, 36);
            nextButton.Location = new Point(375, 14);
            nextButton.Cursor = Cursors.Hand;
            nextButton.Click += OnNextClick;
            footerPanel.Controls.Add(nextButton);

            backButton = new Button();
            backButton.Text = "< Back";
            backButton.Font = new Font("Segoe UI", 9.5f);
            backButton.ForeColor = Color.FromArgb(203, 213, 225);
            backButton.BackColor = Color.FromArgb(51, 65, 85);
            backButton.FlatStyle = FlatStyle.Flat;
            backButton.FlatAppearance.BorderSize = 0;
            backButton.Size = new Size(95, 36);
            backButton.Location = new Point(270, 14);
            backButton.Cursor = Cursors.Hand;
            backButton.Click += OnBackClick;
            footerPanel.Controls.Add(backButton);

            // --- Step 1 Panel: Privacy Policy & License Agreement ---
            step1Panel = new Panel();
            step1Panel.Dock = DockStyle.Fill;
            this.Controls.Add(step1Panel);

            Label step1Header = new Label();
            step1Header.UseMnemonic = false;
            step1Header.Text = "Privacy Policy & End User Agreement";
            step1Header.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
            step1Header.ForeColor = Color.FromArgb(56, 189, 248); // #38bdf8
            step1Header.Location = new Point(30, 20);
            step1Header.Size = new Size(540, 32);
            step1Panel.Controls.Add(step1Header);

            Label step1Sub = new Label();
            step1Sub.Text = "Please review the SmartDM Privacy Policy before continuing setup:";
            step1Sub.Font = new Font("Segoe UI", 9.5f);
            step1Sub.ForeColor = Color.FromArgb(203, 213, 225);
            step1Sub.Location = new Point(30, 55);
            step1Sub.Size = new Size(540, 22);
            step1Panel.Controls.Add(step1Sub);

            RichTextBox eulaBox = new RichTextBox();
            eulaBox.ReadOnly = true;
            eulaBox.BackColor = Color.FromArgb(30, 41, 59);
            eulaBox.ForeColor = Color.FromArgb(241, 245, 249);
            eulaBox.BorderStyle = BorderStyle.None;
            eulaBox.Font = new Font("Segoe UI", 9f);
            eulaBox.Location = new Point(30, 85);
            eulaBox.Size = new Size(540, 210);
            eulaBox.Text = "SmartDM Download Manager - End User License Agreement & Privacy Policy\n\n" +
                "1. Privacy & Zero-Telemetry Commitment:\n" +
                "   SmartDM is built with privacy as a core guarantee. SmartDM does NOT collect, track, or upload your download history, URLs, or personal data to any external server.\n\n" +
                "2. Local Encrypted Database:\n" +
                "   All catalog metadata, category rules, and download sessions are encrypted locally on your computer using AES-256 SQLCipher encryption.\n\n" +
                "3. Safe Download Engine:\n" +
                "   SmartDM includes multi-threaded segment downloading and local malware scanning capabilities. You remain responsible for inspecting files downloaded from third-party websites.\n\n" +
                "4. Open Source License:\n" +
                "   SmartDM is licensed under the MIT Open Source License. You are granted permission to use, copy, and modify the application for personal and commercial use.";
            step1Panel.Controls.Add(eulaBox);

            acceptCheckBox = new CheckBox();
            acceptCheckBox.Text = "I accept the Privacy Policy and End User License Agreement";
            acceptCheckBox.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            acceptCheckBox.ForeColor = Color.FromArgb(56, 189, 248);
            acceptCheckBox.Location = new Point(30, 310);
            acceptCheckBox.Size = new Size(540, 28);
            acceptCheckBox.CheckedChanged += (s, e) => { nextButton.Enabled = acceptCheckBox.Checked; };
            step1Panel.Controls.Add(acceptCheckBox);

            // --- Step 2 Panel: Installation Directory & Options ---
            step2Panel = new Panel();
            step2Panel.Dock = DockStyle.Fill;
            this.Controls.Add(step2Panel);

            Label step2Header = new Label();
            step2Header.UseMnemonic = false;
            step2Header.Text = "Installation Options & Directory";
            step2Header.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
            step2Header.ForeColor = Color.FromArgb(56, 189, 248);
            step2Header.Location = new Point(30, 20);
            step2Header.Size = new Size(540, 32);
            step2Panel.Controls.Add(step2Header);

            Label pathLabel = new Label();
            pathLabel.UseMnemonic = false;
            pathLabel.Text = "Destination Folder:";
            pathLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            pathLabel.ForeColor = Color.FromArgb(203, 213, 225);
            pathLabel.Location = new Point(30, 65);
            pathLabel.Size = new Size(200, 22);
            step2Panel.Controls.Add(pathLabel);

            pathTextBox = new TextBox();
            string defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SmartDM");
            pathTextBox.Text = defaultPath;
            pathTextBox.Font = new Font("Segoe UI", 9.5f);
            pathTextBox.BackColor = Color.FromArgb(30, 41, 59);
            pathTextBox.ForeColor = Color.White;
            pathTextBox.BorderStyle = BorderStyle.FixedSingle;
            pathTextBox.Location = new Point(30, 92);
            pathTextBox.Size = new Size(430, 26);
            step2Panel.Controls.Add(pathTextBox);

            browseButton = new Button();
            browseButton.Text = "Browse...";
            browseButton.Font = new Font("Segoe UI", 9f);
            browseButton.ForeColor = Color.White;
            browseButton.BackColor = Color.FromArgb(51, 65, 85);
            browseButton.FlatStyle = FlatStyle.Flat;
            browseButton.FlatAppearance.BorderSize = 0;
            browseButton.Location = new Point(470, 91);
            browseButton.Size = new Size(100, 28);
            browseButton.Cursor = Cursors.Hand;
            browseButton.Click += OnBrowseClick;
            step2Panel.Controls.Add(browseButton);

            Label optionsLabel = new Label();
            optionsLabel.UseMnemonic = false;
            optionsLabel.Text = "Select Shortcuts & Integration:";
            optionsLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            optionsLabel.ForeColor = Color.FromArgb(203, 213, 225);
            optionsLabel.Location = new Point(30, 140);
            optionsLabel.Size = new Size(400, 22);
            step2Panel.Controls.Add(optionsLabel);

            desktopShortcutCheckBox = new CheckBox();
            desktopShortcutCheckBox.Text = "Create Desktop Shortcut";
            desktopShortcutCheckBox.Checked = true;
            desktopShortcutCheckBox.Font = new Font("Segoe UI", 9.5f);
            desktopShortcutCheckBox.ForeColor = Color.FromArgb(241, 245, 249);
            desktopShortcutCheckBox.Location = new Point(30, 170);
            desktopShortcutCheckBox.Size = new Size(400, 25);
            step2Panel.Controls.Add(desktopShortcutCheckBox);

            startupCheckBox = new CheckBox();
            startupCheckBox.Text = "Launch SmartDM automatically when Windows starts";
            startupCheckBox.Checked = true;
            startupCheckBox.Font = new Font("Segoe UI", 9.5f);
            startupCheckBox.ForeColor = Color.FromArgb(241, 245, 249);
            startupCheckBox.Location = new Point(30, 202);
            startupCheckBox.Size = new Size(450, 25);
            step2Panel.Controls.Add(startupCheckBox);

            browserIntegrationCheckBox = new CheckBox();
            browserIntegrationCheckBox.UseMnemonic = false;
            browserIntegrationCheckBox.Text = "Register Browser Native Messaging (Chrome, Edge, Brave & Firefox)";
            browserIntegrationCheckBox.Checked = true;
            browserIntegrationCheckBox.Font = new Font("Segoe UI", 9.5f);
            browserIntegrationCheckBox.ForeColor = Color.FromArgb(241, 245, 249);
            browserIntegrationCheckBox.Location = new Point(30, 234);
            browserIntegrationCheckBox.Size = new Size(500, 25);
            step2Panel.Controls.Add(browserIntegrationCheckBox);

            // --- Step 3 Panel: Installing Progress ---
            step3Panel = new Panel();
            step3Panel.Dock = DockStyle.Fill;
            this.Controls.Add(step3Panel);

            progressTitleLabel = new Label();
            progressTitleLabel.Text = "Installing SmartDM Download Manager...";
            progressTitleLabel.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
            progressTitleLabel.ForeColor = Color.FromArgb(56, 189, 248);
            progressTitleLabel.Location = new Point(30, 50);
            progressTitleLabel.Size = new Size(540, 35);
            step3Panel.Controls.Add(progressTitleLabel);

            progressStatusLabel = new Label();
            progressStatusLabel.Text = "Extracting components...";
            progressStatusLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Italic);
            progressStatusLabel.ForeColor = Color.FromArgb(148, 163, 184);
            progressStatusLabel.Location = new Point(30, 95);
            progressStatusLabel.Size = new Size(540, 25);
            step3Panel.Controls.Add(progressStatusLabel);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(30, 135);
            progressBar.Size = new Size(540, 26);
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Value = 0;
            step3Panel.Controls.Add(progressBar);

            // --- Step 4 Panel: Finished ---
            step4Panel = new Panel();
            step4Panel.Dock = DockStyle.Fill;
            this.Controls.Add(step4Panel);

            Label step4Header = new Label();
            step4Header.Text = "Installation Complete!";
            step4Header.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            step4Header.ForeColor = Color.FromArgb(52, 211, 153); // Success Green (#34d399)
            step4Header.Location = new Point(30, 40);
            step4Header.Size = new Size(540, 38);
            step4Panel.Controls.Add(step4Header);

            Label step4Sub = new Label();
            step4Sub.Text = "SmartDM v__APP_VERSION__ has been successfully installed on your computer.";
            step4Sub.Font = new Font("Segoe UI", 10f);
            step4Sub.ForeColor = Color.FromArgb(241, 245, 249);
            step4Sub.Location = new Point(30, 85);
            step4Sub.Size = new Size(540, 30);
            step4Panel.Controls.Add(step4Sub);

            launchCheckBox = new CheckBox();
            launchCheckBox.Text = "Launch SmartDM Download Manager now";
            launchCheckBox.Checked = true;
            launchCheckBox.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            launchCheckBox.ForeColor = Color.FromArgb(56, 189, 248);
            launchCheckBox.Location = new Point(30, 140);
            launchCheckBox.Size = new Size(400, 30);
            step4Panel.Controls.Add(launchCheckBox);
        }

        private void ShowStep(int step)
        {
            currentStep = step;
            step1Panel.Visible = (step == 0);
            step2Panel.Visible = (step == 1);
            step3Panel.Visible = (step == 2);
            step4Panel.Visible = (step == 3);

            if (step == 0)
            {
                backButton.Visible = false;
                nextButton.Text = "Next >";
                nextButton.Enabled = acceptCheckBox.Checked;
                cancelButton.Enabled = true;
            }
            else if (step == 1)
            {
                backButton.Visible = true;
                nextButton.Text = "Install >";
                nextButton.Enabled = true;
                cancelButton.Enabled = true;
            }
            else if (step == 2)
            {
                backButton.Visible = false;
                nextButton.Enabled = false;
                cancelButton.Enabled = false;
            }
            else if (step == 3)
            {
                backButton.Visible = false;
                nextButton.Text = "Finish";
                nextButton.Enabled = true;
                cancelButton.Visible = false;
            }
        }

        private void OnBackClick(object sender, EventArgs e)
        {
            if (currentStep > 0 && currentStep < 2)
            {
                ShowStep(currentStep - 1);
            }
        }

        private async void OnNextClick(object sender, EventArgs e)
        {
            if (currentStep == 0)
            {
                ShowStep(1);
            }
            else if (currentStep == 1)
            {
                ShowStep(2);
                await PerformInstallationAsync();
            }
            else if (currentStep == 3)
            {
                if (launchCheckBox.Checked)
                {
                    string targetDir = pathTextBox.Text.Trim();
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
                this.Close();
            }
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

        private async Task PerformInstallationAsync()
        {
            string targetDir = pathTextBox.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Please enter a valid installation directory.", "Invalid Path", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                ShowStep(1);
                return;
            }

            try
            {
                await Task.Run(() =>
                {
                    UpdateProgress(10, "Creating installation directory...");
                    if (!Directory.Exists(targetDir))
                    {
                        Directory.CreateDirectory(targetDir);
                    }

                    UpdateProgress(25, "Extracting SmartDM application payload...");
                    Assembly assembly = Assembly.GetExecutingAssembly();
                    using (Stream stream = assembly.GetManifestResourceStream("payload.zip"))
                    {
                        if (stream != null)
                        {
                            using (ZipArchive archive = new ZipArchive(stream))
                            {
                                int count = 0;
                                int total = archive.Entries.Count;
                                foreach (ZipArchiveEntry entry in archive.Entries)
                                {
                                    count++;
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
                                    if (count % 10 == 0 || count == total)
                                    {
                                        int pct = 25 + (int)(50.0 * count / total);
                                        UpdateProgress(pct, "Extracting: " + entry.Name);
                                    }
                                }
                            }
                        }
                    }

                    if (browserIntegrationCheckBox.Checked)
                    {
                        UpdateProgress(80, "Registering Browser Native Messaging Hosts...");
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
                    }

                    UpdateProgress(90, "Configuring Windows registry & shortcuts...");
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

                        using (Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\SmartDM"))
                        {
                            if (key != null)
                            {
                                key.SetValue("DisplayName", "SmartDM Download Manager");
                                key.SetValue("DisplayVersion", "__APP_VERSION__");
                                key.SetValue("Publisher", "SmartDM");
                                key.SetValue("InstallLocation", targetDir);
                                key.SetValue("UninstallString", "\"" + uninstallBat + "\"");
                                key.SetValue("DisplayIcon", Path.Combine(targetDir, "SmartDM.exe"));
                            }
                        }

                        if (startupCheckBox.Checked)
                        {
                            using (Microsoft.Win32.RegistryKey runKey = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
                            {
                                if (runKey != null)
                                {
                                    runKey.SetValue("SmartDM", "\"" + Path.Combine(targetDir, "SmartDM.exe") + "\" --autostart");
                                }
                            }
                        }
                    }
                    catch { }

                    if (desktopShortcutCheckBox.Checked)
                    {
                        UpdateProgress(95, "Creating Desktop Shortcut...");
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
                    }

                    UpdateProgress(100, "Installation complete!");
                });

                ShowStep(3);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Installation failed: " + ex.Message, "Installation Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowStep(1);
            }
        }

        private void UpdateProgress(int value, string statusText)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdateProgress(value, statusText)));
                return;
            }
            progressBar.Value = Math.Min(100, Math.Max(0, value));
            progressStatusLabel.Text = statusText;
        }
    }
}

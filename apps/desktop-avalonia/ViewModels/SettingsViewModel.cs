using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SmartDm.Desktop.Avalonia.Models;
using SmartDm.Desktop.Avalonia.Services;

namespace SmartDm.Desktop.Avalonia.ViewModels;

public partial class SettingsViewModel : ViewModelBase
{
    private readonly ISettingsService _settingsService;
    private readonly IUpdateCheckerService _updateChecker;
    private readonly IHardwareDiagnosticService _hardwareService;
    private readonly IOllamaDetectorService _ollamaDetector;

    public event Action? RequestClose;
    public Func<Task<string?>>? RequestFolderPicker { get; set; }
    public event Action<string>? RequestThemeChange;
    public event Action<AppSettingsModel, AiConfigModel>? SettingsSaved;

    // ── Tab Management ──
    [ObservableProperty]
    private string _activeTab = "General";

    public bool IsGeneralTab => ActiveTab == "General";
    public bool IsNetworkTab => ActiveTab == "Network";
    public bool IsUpdatesTab => ActiveTab == "Updates";
    public bool IsAiTab => ActiveTab == "AI";
    public bool IsHelpTab => ActiveTab == "Help";

    // ── 1. General & System Settings ──
    [ObservableProperty]
    private bool _runOnStartup;

    [ObservableProperty]
    private bool _closeToTray = true;

    [ObservableProperty]
    private string _defaultDownloadDirectory = string.Empty;

    [ObservableProperty]
    private string _selectedTheme = "System Default";

    partial void OnSelectedThemeChanged(string value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            RequestThemeChange?.Invoke(value);
        }
    }

    public ObservableCollection<string> ThemeOptions { get; } = new() { "System Default", "Light", "Dark" };

    [ObservableProperty]
    private string _selectedLanguage = "en";

    [ObservableProperty]
    private bool _eraseDataOnUninstall = false;

    [ObservableProperty]
    private string _uninstallStatus = string.Empty;

    // ── 2. Network & Engine Settings ──
    [ObservableProperty]
    private int _maxParallelSegments = 8;

    [ObservableProperty]
    private bool _enableSpeedLimit = false;

    [ObservableProperty]
    private int _defaultSpeedLimitKbps = 1000;

    [ObservableProperty]
    private int _connectionTimeoutSeconds = 15;

    [ObservableProperty]
    private int _maxRetries = 3;

    [ObservableProperty]
    private string _userAgent = string.Empty;

    // ── 3. Updates & Release Tracking ──
    [ObservableProperty]
    private bool _autoCheckUpdates = true;

    [ObservableProperty]
    private string _currentVersion = "2.0-STABLE";

    [ObservableProperty]
    private string _updateStatusText = "Status: Up to date.";

    [ObservableProperty]
    private bool _isCheckingUpdates = false;

    [ObservableProperty]
    private bool _isUpdateAvailable = false;

    [ObservableProperty]
    private string _latestVersion = string.Empty;

    [ObservableProperty]
    private string _updateDownloadUrl = string.Empty;

    [ObservableProperty]
    private double _updateProgress = 0.0;

    [ObservableProperty]
    private bool _isDownloadingUpdate = false;

    // ── 4. AI Integration ──
    [ObservableProperty]
    private string _hardwareSummary = string.Empty;

    [ObservableProperty]
    private string _hardwareRecommendation = string.Empty;

    [ObservableProperty]
    private string _aiProviderType = "DISABLED";

    [ObservableProperty]
    private string _geminiApiKey = string.Empty;

    [ObservableProperty]
    private string _geminiBaseUrl = "https://generativelanguage.googleapis.com";

    [ObservableProperty]
    private string _geminiModel = "gemini-1.5-flash";

    [ObservableProperty]
    private string _ollamaBaseUrl = "http://localhost:11434";

    [ObservableProperty]
    private string _selectedOllamaModel = "qwen2.5:3b";

    [ObservableProperty]
    private string _aiStatusMessage = "SmartDM AI running in 100% offline local mode.";

    public ObservableCollection<string> AvailableOllamaModels { get; } = new();

    public bool IsAiDisabled => AiProviderType == "DISABLED";
    public bool IsAiGemini => AiProviderType == "GEMINI";
    public bool IsAiOllama => AiProviderType == "OPENAI_COMPATIBLE";

    // ── 5. Help & About ──
    public string BugReportUrl => "https://github.com/ifahad2k/SmartDM/issues";
    public string GitHubRepoUrl => "https://github.com/ifahad2k/SmartDM";

    public SettingsViewModel(
        ISettingsService? settingsService = null,
        IUpdateCheckerService? updateChecker = null,
        IHardwareDiagnosticService? hardwareService = null,
        IOllamaDetectorService? ollamaDetector = null)
    {
        _settingsService = settingsService ?? new SettingsService();
        _updateChecker = updateChecker ?? new UpdateCheckerService();
        _hardwareService = hardwareService ?? new HardwareDiagnosticService();
        _ollamaDetector = ollamaDetector ?? new OllamaDetectorService();

        CurrentVersion = _updateChecker.CurrentVersion;
        LoadInitialValues();
        InspectHardware();
    }

    private void LoadInitialValues()
    {
        var s = _settingsService.CurrentSettings;
        RunOnStartup = s.RunOnStartup;
        CloseToTray = s.CloseToTray;
        DefaultDownloadDirectory = string.IsNullOrWhiteSpace(s.DefaultDownloadDirectory)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
            : s.DefaultDownloadDirectory;
        string diskTheme = s.Theme ?? "System Default";
        if (diskTheme.Equals("Dark", StringComparison.OrdinalIgnoreCase)) SelectedTheme = "Dark";
        else if (diskTheme.Equals("Light", StringComparison.OrdinalIgnoreCase)) SelectedTheme = "Light";
        else SelectedTheme = "System Default";

        SelectedLanguage = s.Language ?? "en";
        MaxParallelSegments = s.MaxParallelSegments > 0 ? s.MaxParallelSegments : 8;
        EnableSpeedLimit = s.EnableSpeedLimit;
        DefaultSpeedLimitKbps = s.DefaultSpeedLimitKbps > 0 ? s.DefaultSpeedLimitKbps : 1000;
        ConnectionTimeoutSeconds = s.ConnectionTimeoutSeconds > 0 ? s.ConnectionTimeoutSeconds : 15;
        MaxRetries = s.MaxRetries > 0 ? s.MaxRetries : 3;
        UserAgent = string.IsNullOrWhiteSpace(s.UserAgent)
            ? "SmartDM/2.0 (Windows NT 10.0; Win64; x64) DesktopEngine"
            : s.UserAgent;
        AutoCheckUpdates = s.AutoCheckUpdates;

        var ai = _settingsService.CurrentAiConfig;
        AiProviderType = string.IsNullOrWhiteSpace(ai.ProviderType) ? "DISABLED" : ai.ProviderType;
        GeminiApiKey = ai.ApiKey ?? "";
        GeminiBaseUrl = string.IsNullOrWhiteSpace(ai.BaseUrl) ? "https://generativelanguage.googleapis.com" : ai.BaseUrl;
        SelectedOllamaModel = string.IsNullOrWhiteSpace(ai.ModelName) ? "qwen2.5:3b" : ai.ModelName;

        AvailableOllamaModels.Clear();
        AvailableOllamaModels.Add("qwen2.5:3b");
        AvailableOllamaModels.Add("llama3.2:3b");
        AvailableOllamaModels.Add("phi3:mini");
        AvailableOllamaModels.Add("mistral:7b");

        UpdateAiVisibility();
    }

    private void InspectHardware()
    {
        var hw = _hardwareService.CheckHardware();
        HardwareSummary = $"🖥️ {hw.SummaryMessage}";
        HardwareRecommendation = $"Optimal local model: {hw.RecommendedModel}";
    }

    [RelayCommand]
    public void SelectTab(string tabName)
    {
        ActiveTab = tabName;
        OnPropertyChanged(nameof(IsGeneralTab));
        OnPropertyChanged(nameof(IsNetworkTab));
        OnPropertyChanged(nameof(IsUpdatesTab));
        OnPropertyChanged(nameof(IsAiTab));
        OnPropertyChanged(nameof(IsHelpTab));
    }

    [RelayCommand]
    public async Task BrowseDirectoryAsync()
    {
        if (RequestFolderPicker != null)
        {
            var folder = await RequestFolderPicker.Invoke();
            if (!string.IsNullOrWhiteSpace(folder))
            {
                DefaultDownloadDirectory = folder;
            }
        }
    }

    [RelayCommand]
    public void SetProvider(string provider)
    {
        AiProviderType = provider;
        UpdateAiVisibility();
    }

    private void UpdateAiVisibility()
    {
        OnPropertyChanged(nameof(IsAiDisabled));
        OnPropertyChanged(nameof(IsAiGemini));
        OnPropertyChanged(nameof(IsAiOllama));

        if (IsAiDisabled)
        {
            AiStatusMessage = "SmartDM running in 100% offline local mode. Zero telemetry.";
        }
        else if (IsAiGemini)
        {
            AiStatusMessage = "Google Gemini API mode active. Fast cloud analysis enabled.";
        }
        else
        {
            AiStatusMessage = $"Local Ollama active at {OllamaBaseUrl}. Model: {SelectedOllamaModel}";
        }
    }

    [RelayCommand]
    public async Task DetectOllamaModelsAsync()
    {
        AiStatusMessage = $"Querying local Ollama instance ({OllamaBaseUrl})...";
        var models = await _ollamaDetector.DetectInstalledModelsAsync(OllamaBaseUrl);
        if (models.Count > 0)
        {
            AvailableOllamaModels.Clear();
            foreach (var m in models) AvailableOllamaModels.Add(m);
            SelectedOllamaModel = models[0];
            AiStatusMessage = $"Found {models.Count} local Ollama models installed.";
        }
        else
        {
            AiStatusMessage = "No models found or Ollama is not running. Ensure 'ollama serve' is active.";
        }
    }

    [RelayCommand]
    public async Task CheckForUpdatesAsync()
    {
        IsCheckingUpdates = true;
        UpdateStatusText = "Connecting to GitHub Releases...";
        IsUpdateAvailable = false;

        var result = await _updateChecker.CheckForUpdatesAsync();
        IsCheckingUpdates = false;

        if (result.Error != null)
        {
            UpdateStatusText = $"Check Failed: {result.Error}";
        }
        else if (result.UpdateAvailable)
        {
            IsUpdateAvailable = true;
            LatestVersion = result.LatestVersion;
            UpdateDownloadUrl = result.DownloadUrl ?? "";
            UpdateStatusText = $"New version available: {result.LatestVersion}!";
        }
        else
        {
            UpdateStatusText = $"SmartDM v{CurrentVersion} is the latest version.";
        }
    }

    [RelayCommand]
    public async Task DownloadAndInstallUpdateAsync()
    {
        if (string.IsNullOrEmpty(UpdateDownloadUrl)) return;

        IsDownloadingUpdate = true;
        UpdateProgress = 0.0;
        UpdateStatusText = "Downloading update package...";

        var progress = new Progress<double>(p =>
        {
            UpdateProgress = p * 100.0;
            UpdateStatusText = $"Downloading update package: {UpdateProgress:F0}%";
        });

        try
        {
            await _updateChecker.DownloadAndInstallUpdateAsync(UpdateDownloadUrl, progress);
            UpdateStatusText = "Update downloaded! Launching installer...";
        }
        catch (Exception ex)
        {
            UpdateStatusText = $"Update failed: {ex.Message}";
        }
        finally
        {
            IsDownloadingUpdate = false;
        }
    }

    [RelayCommand]
    public async Task PerformUninstallAsync()
    {
        UninstallStatus = "Uninstalling SmartDM browser integrations and registries...";
        await _settingsService.PerformUninstallAsync(EraseDataOnUninstall);
        UninstallStatus = "Uninstallation complete. You can now close or remove the app.";
    }

    [RelayCommand]
    public void OpenAppDataFolder()
    {
        try
        {
            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
            Directory.CreateDirectory(appDir);
            Process.Start(new ProcessStartInfo
            {
                FileName = appDir,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Open folder error: {ex.Message}");
        }
    }

    [RelayCommand]
    public void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Open URL error: {ex.Message}");
        }
    }

    [RelayCommand]
    public async Task SaveAsync()
    {
        // 1. Update AppSettingsModel
        var s = new AppSettingsModel
        {
            RunOnStartup = RunOnStartup,
            CloseToTray = CloseToTray,
            DefaultDownloadDirectory = DefaultDownloadDirectory,
            Theme = SelectedTheme,
            Language = SelectedLanguage,
            MaxParallelSegments = MaxParallelSegments,
            EnableSpeedLimit = EnableSpeedLimit,
            DefaultSpeedLimitKbps = DefaultSpeedLimitKbps,
            ConnectionTimeoutSeconds = ConnectionTimeoutSeconds,
            MaxRetries = MaxRetries,
            UserAgent = UserAgent,
            AutoCheckUpdates = AutoCheckUpdates
        };

        await _settingsService.SaveAppSettingsAsync(s);
        _settingsService.SetStartup(RunOnStartup);

        // 2. Update AiConfigModel
        var ai = new AiConfigModel
        {
            Enabled = !IsAiDisabled,
            ProviderType = AiProviderType,
            ApiKey = GeminiApiKey,
            BaseUrl = IsAiGemini ? GeminiBaseUrl : OllamaBaseUrl,
            ModelName = SelectedOllamaModel
        };

        await _settingsService.SaveAiConfigAsync(ai);

        // 3. Notify Theme Change
        RequestThemeChange?.Invoke(SelectedTheme);

        // 4. Notify Listeners
        SettingsSaved?.Invoke(s, ai);

        RequestClose?.Invoke();
    }

    [RelayCommand]
    public void Cancel()
    {
        RequestClose?.Invoke();
    }
}

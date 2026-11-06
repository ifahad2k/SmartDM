using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using SmartDm.Desktop.Avalonia.Models;

namespace SmartDm.Desktop.Avalonia.Services;

public class SqliteDatabaseRepository : IDatabaseRepository
{
    private readonly string _connectionString;
    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private bool _isInitialized = false;

    public SqliteDatabaseRepository(string? dbPath = null)
    {
        if (string.IsNullOrWhiteSpace(dbPath))
        {
            string appDir = AppProfile.DirectoryPath;
            Directory.CreateDirectory(appDir);
            dbPath = Path.Combine(appDir, "smartdm.db");
        }
        else
        {
            string? dir = Path.GetDirectoryName(dbPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        }

        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        };
        _connectionString = builder.ToString();
    }

    public async Task InitializeAsync()
    {
        if (_isInitialized) return;

        await _semaphore.WaitAsync();
        try
        {
            if (_isInitialized) return;
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string createTableSql = @"
                CREATE TABLE IF NOT EXISTS downloads (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    domain TEXT,
                    total_bytes INTEGER NOT NULL,
                    downloaded_bytes INTEGER NOT NULL,
                    speed_mbps REAL NOT NULL,
                    progress_percentage REAL NOT NULL,
                    status INTEGER NOT NULL,
                    category TEXT,
                    icon_source TEXT,
                    icon_bg TEXT,
                    secondary_badge TEXT,
                    parallel_threads INTEGER,
                    active_mirrors INTEGER,
                    eta_seconds INTEGER,
                    sha256_hash TEXT,
                    expected_sha256 TEXT,
                    save_path TEXT,
                    status_detail TEXT,
                    subline TEXT,
                    footer_detail TEXT,
                    footer_right TEXT,
                    is_storage INTEGER NOT NULL DEFAULT 0,
                    referer TEXT,
                    cookies TEXT,
                    user_agent TEXT,
                    video_url TEXT,
                    audio_url TEXT,
                    page_url TEXT,
                    etag TEXT,
                    last_modified TEXT,
                    conflict_action INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT,
                    updated_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);

                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    description TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS crash_reports (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    exception_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    stack_trace TEXT,
                    source TEXT,
                    context TEXT,
                    os_version TEXT,
                    app_version TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_crash_reports_timestamp ON crash_reports(timestamp DESC);
            ";

            await using var cmd = new SqliteCommand(createTableSql, conn);
            await cmd.ExecuteNonQueryAsync();

            // Run versioned incremental migrations with ledger tracking
            var versionedMigrations = new (int Version, string Description, string Sql)[]
            {
                (1, "Add rich media URLs and browser headers to downloads", @"
                    ALTER TABLE downloads ADD COLUMN referer TEXT;
                    ALTER TABLE downloads ADD COLUMN cookies TEXT;
                    ALTER TABLE downloads ADD COLUMN user_agent TEXT;
                    ALTER TABLE downloads ADD COLUMN video_url TEXT;
                    ALTER TABLE downloads ADD COLUMN audio_url TEXT;
                    ALTER TABLE downloads ADD COLUMN page_url TEXT;
                "),
                (2, "Add expected_sha256 column to downloads table", @"
                    ALTER TABLE downloads ADD COLUMN expected_sha256 TEXT;
                "),
                (3, "Add etag, last_modified, and conflict_action columns to downloads table", @"
                    ALTER TABLE downloads ADD COLUMN etag TEXT;
                    ALTER TABLE downloads ADD COLUMN last_modified TEXT;
                    ALTER TABLE downloads ADD COLUMN conflict_action INTEGER NOT NULL DEFAULT 0;
                "),
                (4, "Persist probed range capability", @"
                    ALTER TABLE downloads ADD COLUMN supports_ranges INTEGER CHECK (supports_ranges IN (0, 1));
                "),
                (5, "Persist browser HLS capture", @"
                    ALTER TABLE downloads ADD COLUMN media_kind TEXT;
                    ALTER TABLE downloads ADD COLUMN manifest_text TEXT;
                "),
                (6, "Persist paired HLS audio capture", "ALTER TABLE downloads ADD COLUMN audio_manifest_text TEXT;"),
                (7, "Persist selected media representation", "ALTER TABLE downloads ADD COLUMN source_page_url TEXT; ALTER TABLE downloads ADD COLUMN format_id TEXT;"),
                (8, "Persist scanner evidence and quarantine", "ALTER TABLE downloads ADD COLUMN safety_verdict INTEGER NOT NULL DEFAULT 0; ALTER TABLE downloads ADD COLUMN safety_details TEXT; ALTER TABLE downloads ADD COLUMN scanner_name TEXT; ALTER TABLE downloads ADD COLUMN quarantine_path TEXT;")
            };

            foreach (var mig in versionedMigrations)
            {
                bool alreadyApplied = false;
                await using (var checkCmd = new SqliteCommand("SELECT COUNT(*) FROM schema_migrations WHERE version = @v;", conn))
                {
                    checkCmd.Parameters.AddWithValue("@v", mig.Version);
                    var count = Convert.ToInt64(await checkCmd.ExecuteScalarAsync());
                    alreadyApplied = (count > 0);
                }

                if (!alreadyApplied)
                {
                    // DDL and its ledger entry commit together; disposal rolls
                    // back both if any statement or ledger insertion fails.
                    using var transaction = conn.BeginTransaction();
                    string[] stmts = mig.Sql.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    foreach (var stmt in stmts)
                    {
                        try
                        {
                            await using var migCmd = new SqliteCommand(stmt, conn, transaction);
                            await migCmd.ExecuteNonQueryAsync();
                        }
                        catch (SqliteException ex) when (ex.SqliteErrorCode == 1 && ex.Message.Contains("duplicate column name", StringComparison.OrdinalIgnoreCase))
                        {
                            // Column already exists from previous ad-hoc runs
                        }
                    }

                    await using var recordCmd = new SqliteCommand("INSERT INTO schema_migrations (version, description, applied_at) VALUES (@v, @desc, @appliedAt);", conn, transaction);
                    recordCmd.Parameters.AddWithValue("@v", mig.Version);
                    recordCmd.Parameters.AddWithValue("@desc", mig.Description);
                    recordCmd.Parameters.AddWithValue("@appliedAt", DateTime.UtcNow.ToString("O"));
                    await recordCmd.ExecuteNonQueryAsync();
                    transaction.Commit();
                }
            }

            // Reset any orphaned Active transfers from previous abnormal shutdown to Paused
            try
            {
                string resetActiveSql = @"
                    UPDATE downloads
                    SET status = 1,
                        status_detail = 'Paused',
                        speed_mbps = 0
                    WHERE status = 0;
                ";
                await using var resetCmd = new SqliteCommand(resetActiveSql, conn);
                await resetCmd.ExecuteNonQueryAsync();
            }
            catch { }

            _isInitialized = true;
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<List<DownloadModel>> GetAllDownloadsAsync()
    {
        await InitializeAsync();
        var list = new List<DownloadModel>();

        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string query = "SELECT * FROM downloads ORDER BY created_at DESC;";
            await using var cmd = new SqliteCommand(query, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var dl = new DownloadModel
                {
                    Id = reader.GetString(reader.GetOrdinal("id")),
                    Title = reader.GetString(reader.GetOrdinal("title")),
                    Url = reader.GetString(reader.GetOrdinal("url")),
                    Domain = reader.IsDBNull(reader.GetOrdinal("domain")) ? "" : reader.GetString(reader.GetOrdinal("domain")),
                    TotalBytes = reader.GetInt64(reader.GetOrdinal("total_bytes")),
                    DownloadedBytes = reader.GetInt64(reader.GetOrdinal("downloaded_bytes")),
                    SpeedMbps = reader.GetDouble(reader.GetOrdinal("speed_mbps")),
                    ProgressPercentage = reader.GetDouble(reader.GetOrdinal("progress_percentage")),
                    Status = (DownloadStatus)reader.GetInt32(reader.GetOrdinal("status")),
                    Category = reader.IsDBNull(reader.GetOrdinal("category")) ? "General" : reader.GetString(reader.GetOrdinal("category")),
                    IconSource = reader.IsDBNull(reader.GetOrdinal("icon_source")) ? "/Assets/Icons/disc-blue.png" : reader.GetString(reader.GetOrdinal("icon_source")),
                    IconBg = reader.IsDBNull(reader.GetOrdinal("icon_bg")) ? "#EAF2FF" : reader.GetString(reader.GetOrdinal("icon_bg")),
                    SecondaryBadge = reader.IsDBNull(reader.GetOrdinal("secondary_badge")) ? "" : reader.GetString(reader.GetOrdinal("secondary_badge")),
                    ParallelThreads = reader.GetInt32(reader.GetOrdinal("parallel_threads")),
                    ActiveMirrors = reader.GetInt32(reader.GetOrdinal("active_mirrors")),
                    EtaSeconds = reader.GetInt32(reader.GetOrdinal("eta_seconds")),
                    Sha256Hash = reader.IsDBNull(reader.GetOrdinal("sha256_hash")) ? "" : reader.GetString(reader.GetOrdinal("sha256_hash")),
                    ExpectedSha256 = reader.IsDBNull(reader.GetOrdinal("expected_sha256")) ? "" : reader.GetString(reader.GetOrdinal("expected_sha256")),
                    SavePath = reader.IsDBNull(reader.GetOrdinal("save_path")) ? "" : reader.GetString(reader.GetOrdinal("save_path")),
                    StatusDetail = reader.IsDBNull(reader.GetOrdinal("status_detail")) ? "" : reader.GetString(reader.GetOrdinal("status_detail")),
                    Subline = reader.IsDBNull(reader.GetOrdinal("subline")) ? "" : reader.GetString(reader.GetOrdinal("subline")),
                    FooterDetail = reader.IsDBNull(reader.GetOrdinal("footer_detail")) ? "" : reader.GetString(reader.GetOrdinal("footer_detail")),
                    FooterRight = reader.IsDBNull(reader.GetOrdinal("footer_right")) ? "" : reader.GetString(reader.GetOrdinal("footer_right")),
                    IsStorage = reader.GetInt32(reader.GetOrdinal("is_storage")) == 1,
                    Referer = reader.IsDBNull(reader.GetOrdinal("referer")) ? null : reader.GetString(reader.GetOrdinal("referer")),
                    Cookies = reader.IsDBNull(reader.GetOrdinal("cookies")) ? null : reader.GetString(reader.GetOrdinal("cookies")),
                    UserAgent = reader.IsDBNull(reader.GetOrdinal("user_agent")) ? null : reader.GetString(reader.GetOrdinal("user_agent")),
                    VideoUrl = reader.IsDBNull(reader.GetOrdinal("video_url")) ? null : reader.GetString(reader.GetOrdinal("video_url")),
                    AudioUrl = reader.IsDBNull(reader.GetOrdinal("audio_url")) ? null : reader.GetString(reader.GetOrdinal("audio_url")),
                    PageUrl = reader.IsDBNull(reader.GetOrdinal("page_url")) ? null : reader.GetString(reader.GetOrdinal("page_url")),
                    ETag = reader.IsDBNull(reader.GetOrdinal("etag")) ? "" : reader.GetString(reader.GetOrdinal("etag")),
                    LastModified = reader.IsDBNull(reader.GetOrdinal("last_modified")) ? null : reader.GetString(reader.GetOrdinal("last_modified")),
                    SafetyVerdict = (SafetyVerdict)reader.GetInt32(reader.GetOrdinal("safety_verdict")),
                    SafetyDetails = reader.IsDBNull(reader.GetOrdinal("safety_details")) ? "No scan evidence recorded" : reader.GetString(reader.GetOrdinal("safety_details")),
                    AvScannerName = reader.IsDBNull(reader.GetOrdinal("scanner_name")) ? "Not scanned" : reader.GetString(reader.GetOrdinal("scanner_name")),
                    QuarantinePath = reader.IsDBNull(reader.GetOrdinal("quarantine_path")) ? null : reader.GetString(reader.GetOrdinal("quarantine_path")),
                    SourcePageUrl = reader.IsDBNull(reader.GetOrdinal("source_page_url")) ? null : reader.GetString(reader.GetOrdinal("source_page_url")),
                    FormatId = reader.IsDBNull(reader.GetOrdinal("format_id")) ? string.Empty : reader.GetString(reader.GetOrdinal("format_id")),
                    AudioManifestText = reader.IsDBNull(reader.GetOrdinal("audio_manifest_text")) ? null : reader.GetString(reader.GetOrdinal("audio_manifest_text")),
                    MediaKind = reader.IsDBNull(reader.GetOrdinal("media_kind")) ? null : reader.GetString(reader.GetOrdinal("media_kind")),
                    ManifestText = reader.IsDBNull(reader.GetOrdinal("manifest_text")) ? null : reader.GetString(reader.GetOrdinal("manifest_text")),
                    SupportsRanges = reader.IsDBNull(reader.GetOrdinal("supports_ranges")) ? null : reader.GetInt32(reader.GetOrdinal("supports_ranges")) == 1,
                    ConflictAction = reader.IsDBNull(reader.GetOrdinal("conflict_action")) ? DestinationConflictAction.DefaultNeverOverwrite : (DestinationConflictAction)reader.GetInt32(reader.GetOrdinal("conflict_action"))
                };

                list.Add(dl);
            }
        }
        finally
        {
            _semaphore.Release();
        }

        return list;
    }

    public async Task SaveDownloadAsync(DownloadModel dl)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string upsertSql = @"
                INSERT INTO downloads (
                    id, title, url, domain, total_bytes, downloaded_bytes, speed_mbps,
                    progress_percentage, status, category, icon_source, icon_bg, secondary_badge,
                    parallel_threads, active_mirrors, eta_seconds, sha256_hash, expected_sha256, save_path,
                    status_detail, subline, footer_detail, footer_right, is_storage,
                    referer, cookies, user_agent, video_url, audio_url, page_url,
                    etag, last_modified, conflict_action, supports_ranges, media_kind, manifest_text, audio_manifest_text, source_page_url, format_id, safety_verdict, safety_details, scanner_name, quarantine_path,
                    created_at, updated_at
                ) VALUES (
                    @id, @title, @url, @domain, @total_bytes, @downloaded_bytes, @speed_mbps,
                    @progress_percentage, @status, @category, @icon_source, @icon_bg, @secondary_badge,
                    @parallel_threads, @active_mirrors, @eta_seconds, @sha256_hash, @expected_sha256, @save_path,
                    @status_detail, @subline, @footer_detail, @footer_right, @is_storage,
                    @referer, @cookies, @user_agent, @video_url, @audio_url, @page_url,
                    @etag, @last_modified, @conflict_action, @supports_ranges, @media_kind, @manifest_text, @audio_manifest_text, @source_page_url, @format_id, @safety_verdict, @safety_details, @scanner_name, @quarantine_path,
                    @created_at, @updated_at
                ) ON CONFLICT(id) DO UPDATE SET
                    title = @title,
                    url = @url,
                    domain = @domain,
                    total_bytes = @total_bytes,
                    downloaded_bytes = @downloaded_bytes,
                    speed_mbps = @speed_mbps,
                    progress_percentage = @progress_percentage,
                    status = @status,
                    category = @category,
                    icon_source = @icon_source,
                    icon_bg = @icon_bg,
                    secondary_badge = @secondary_badge,
                    parallel_threads = @parallel_threads,
                    active_mirrors = @active_mirrors,
                    eta_seconds = @eta_seconds,
                    sha256_hash = @sha256_hash,
                    expected_sha256 = @expected_sha256,
                    save_path = @save_path,
                    status_detail = @status_detail,
                    subline = @subline,
                    footer_detail = @footer_detail,
                    footer_right = @footer_right,
                    is_storage = @is_storage,
                    referer = @referer,
                    cookies = @cookies,
                    user_agent = @user_agent,
                    video_url = @video_url,
                    audio_url = @audio_url,
                    page_url = @page_url,
                    etag = @etag,
                    last_modified = @last_modified,
                    conflict_action = @conflict_action,
                    supports_ranges = @supports_ranges,
                    media_kind = @media_kind,
                    manifest_text = @manifest_text,
                    audio_manifest_text = @audio_manifest_text,
                    source_page_url = @source_page_url,
                    format_id = @format_id,
                    safety_verdict = @safety_verdict,
                    safety_details = @safety_details,
                    scanner_name = @scanner_name,
                    quarantine_path = @quarantine_path,
                    updated_at = @updated_at;
            ";

            await using var cmd = new SqliteCommand(upsertSql, conn);
            cmd.Parameters.AddWithValue("@id", dl.Id);
            cmd.Parameters.AddWithValue("@title", dl.Title);
            cmd.Parameters.AddWithValue("@url", dl.Url);
            cmd.Parameters.AddWithValue("@domain", dl.Domain ?? "");
            cmd.Parameters.AddWithValue("@total_bytes", dl.TotalBytes);
            cmd.Parameters.AddWithValue("@downloaded_bytes", dl.DownloadedBytes);
            cmd.Parameters.AddWithValue("@speed_mbps", dl.SpeedMbps);
            cmd.Parameters.AddWithValue("@progress_percentage", dl.ProgressPercentage);
            cmd.Parameters.AddWithValue("@status", (int)dl.Status);
            cmd.Parameters.AddWithValue("@category", dl.Category ?? "General");
            cmd.Parameters.AddWithValue("@icon_source", dl.IconSource ?? "/Assets/Icons/disc-blue.png");
            cmd.Parameters.AddWithValue("@icon_bg", dl.IconBg ?? "#EAF2FF");
            cmd.Parameters.AddWithValue("@secondary_badge", dl.SecondaryBadge ?? "");
            cmd.Parameters.AddWithValue("@parallel_threads", dl.ParallelThreads);
            cmd.Parameters.AddWithValue("@active_mirrors", dl.ActiveMirrors);
            cmd.Parameters.AddWithValue("@eta_seconds", dl.EtaSeconds);
            cmd.Parameters.AddWithValue("@sha256_hash", dl.Sha256Hash ?? "");
            cmd.Parameters.AddWithValue("@expected_sha256", (object?)dl.ExpectedSha256 ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@save_path", dl.SavePath ?? "");
            cmd.Parameters.AddWithValue("@status_detail", dl.StatusDetail ?? "");
            cmd.Parameters.AddWithValue("@subline", dl.Subline ?? "");
            cmd.Parameters.AddWithValue("@footer_detail", dl.FooterDetail ?? "");
            cmd.Parameters.AddWithValue("@footer_right", dl.FooterRight ?? "");
            cmd.Parameters.AddWithValue("@is_storage", dl.IsStorage ? 1 : 0);
            cmd.Parameters.AddWithValue("@referer", (object?)dl.Referer ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cookies", (object?)dl.Cookies ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user_agent", (object?)dl.UserAgent ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@video_url", (object?)dl.VideoUrl ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@audio_url", (object?)dl.AudioUrl ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@page_url", (object?)dl.PageUrl ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@etag", (object?)dl.ETag ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@last_modified", (object?)dl.LastModified ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@conflict_action", (int)dl.ConflictAction);
            cmd.Parameters.AddWithValue("@supports_ranges", dl.SupportsRanges.HasValue ? (object)(dl.SupportsRanges.Value ? 1 : 0) : DBNull.Value);
            cmd.Parameters.AddWithValue("@safety_verdict", (int)dl.SafetyVerdict);
            cmd.Parameters.AddWithValue("@safety_details", dl.SafetyDetails);
            cmd.Parameters.AddWithValue("@scanner_name", dl.AvScannerName);
            cmd.Parameters.AddWithValue("@quarantine_path", (object?)dl.QuarantinePath ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@source_page_url", (object?)dl.SourcePageUrl ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@format_id", dl.FormatId);
            cmd.Parameters.AddWithValue("@audio_manifest_text", (object?)dl.AudioManifestText ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@media_kind", (object?)dl.MediaKind ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@manifest_text", (object?)dl.ManifestText ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@created_at", DateTime.UtcNow.ToString("O"));
            cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow.ToString("O"));

            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task DeleteDownloadAsync(string id)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string deleteSql = "DELETE FROM downloads WHERE id = @id;";
            await using var cmd = new SqliteCommand(deleteSql, conn);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task UpdateDownloadProgressAsync(string id, long downloadedBytes, double speedMbps, double progress, int etaSeconds)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string sql = @"
                UPDATE downloads 
                SET downloaded_bytes = @downloaded,
                    speed_mbps = @speed,
                    progress_percentage = @progress,
                    eta_seconds = @eta,
                    updated_at = @updated_at
                WHERE id = @id;
            ";
            await using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@downloaded", downloadedBytes);
            cmd.Parameters.AddWithValue("@speed", speedMbps);
            cmd.Parameters.AddWithValue("@progress", progress);
            cmd.Parameters.AddWithValue("@eta", etaSeconds);
            cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow.ToString("O"));
            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task UpdateDownloadStatusAsync(string id, DownloadStatus status, string statusDetail, string subline)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string sql = @"
                UPDATE downloads 
                SET status = @status,
                    status_detail = @status_detail,
                    subline = @subline,
                    updated_at = @updated_at
                WHERE id = @id;
            ";
            await using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@status", (int)status);
            cmd.Parameters.AddWithValue("@status_detail", statusDetail ?? "");
            cmd.Parameters.AddWithValue("@subline", subline ?? "");
            cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow.ToString("O"));
            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task UpdateChecksumAndSecurityAsync(string id, string sha256, bool isQuarantined, string statusDetail)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string sql = @"
                UPDATE downloads 
                SET sha256_hash = @sha256,
                    status = CASE WHEN @is_quarantined = 1 THEN 3 ELSE status END,
                    status_detail = @status_detail,
                    updated_at = @updated_at
                WHERE id = @id;
            ";
            await using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@sha256", sha256 ?? "");
            cmd.Parameters.AddWithValue("@is_quarantined", isQuarantined ? 1 : 0);
            cmd.Parameters.AddWithValue("@status_detail", statusDetail ?? "");
            cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow.ToString("O"));
            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task SaveCrashReportAsync(CrashReport crash)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string sql = @"
                INSERT INTO crash_reports (id, timestamp, exception_type, message, stack_trace, source, context, os_version, app_version)
                VALUES (@id, @timestamp, @exception_type, @message, @stack_trace, @source, @context, @os_version, @app_version);
            ";
            await using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", crash.Id);
            cmd.Parameters.AddWithValue("@timestamp", crash.Timestamp.ToString("O"));
            cmd.Parameters.AddWithValue("@exception_type", crash.ExceptionType);
            cmd.Parameters.AddWithValue("@message", crash.Message);
            cmd.Parameters.AddWithValue("@stack_trace", (object?)crash.StackTrace ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@source", (object?)crash.Source ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@context", (object?)crash.Context ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@os_version", (object?)crash.OsVersion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@app_version", (object?)crash.AppVersion ?? DBNull.Value);

            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public void SaveCrashReportSync(CrashReport crash)
    {
        try
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();

            // Ensure table exists even in unhandled crash scenario
            string ensureTableSql = @"
                CREATE TABLE IF NOT EXISTS crash_reports (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    exception_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    stack_trace TEXT,
                    source TEXT,
                    context TEXT,
                    os_version TEXT,
                    app_version TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_crash_reports_timestamp ON crash_reports(timestamp DESC);
            ";
            using (var tableCmd = new SqliteCommand(ensureTableSql, conn))
            {
                tableCmd.ExecuteNonQuery();
            }

            string sql = @"
                INSERT INTO crash_reports (id, timestamp, exception_type, message, stack_trace, source, context, os_version, app_version)
                VALUES (@id, @timestamp, @exception_type, @message, @stack_trace, @source, @context, @os_version, @app_version);
            ";
            using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", crash.Id);
            cmd.Parameters.AddWithValue("@timestamp", crash.Timestamp.ToString("O"));
            cmd.Parameters.AddWithValue("@exception_type", crash.ExceptionType);
            cmd.Parameters.AddWithValue("@message", crash.Message);
            cmd.Parameters.AddWithValue("@stack_trace", (object?)crash.StackTrace ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@source", (object?)crash.Source ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@context", (object?)crash.Context ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@os_version", (object?)crash.OsVersion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@app_version", (object?)crash.AppVersion ?? DBNull.Value);

            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[SqliteDatabaseRepository] Failed to sync-save crash report: {ex.Message}");
        }
    }

    public async Task<List<CrashReport>> GetRecentCrashReportsAsync(int limit = 20)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            var list = new List<CrashReport>();
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string sql = @"
                SELECT id, timestamp, exception_type, message, stack_trace, source, context, os_version, app_version
                FROM crash_reports
                ORDER BY timestamp DESC
                LIMIT @limit;
            ";
            await using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@limit", limit);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                list.Add(ReadCrashReport(reader));
            }
            return list;
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public List<CrashReport> GetRecentCrashReportsSync(int limit = 20)
    {
        try
        {
            var list = new List<CrashReport>();
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();

            string sql = @"
                SELECT id, timestamp, exception_type, message, stack_trace, source, context, os_version, app_version
                FROM crash_reports
                ORDER BY timestamp DESC
                LIMIT @limit;
            ";
            using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@limit", limit);

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(ReadCrashReport(reader));
            }
            return list;
        }
        catch
        {
            return new List<CrashReport>();
        }
    }

    private static CrashReport ReadCrashReport(SqliteDataReader reader)
    {
        DateTime.TryParse(reader.GetString(1), out var ts);
        return new CrashReport
        {
            Id = reader.GetString(0),
            Timestamp = ts,
            ExceptionType = reader.GetString(2),
            Message = reader.GetString(3),
            StackTrace = reader.IsDBNull(4) ? null : reader.GetString(4),
            Source = reader.IsDBNull(5) ? null : reader.GetString(5),
            Context = reader.IsDBNull(6) ? null : reader.GetString(6),
            OsVersion = reader.IsDBNull(7) ? null : reader.GetString(7),
            AppVersion = reader.IsDBNull(8) ? null : reader.GetString(8)
        };
    }
}

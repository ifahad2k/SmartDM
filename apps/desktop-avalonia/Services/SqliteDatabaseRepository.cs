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
            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
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
                    save_path TEXT,
                    status_detail TEXT,
                    subline TEXT,
                    footer_detail TEXT,
                    footer_right TEXT,
                    is_storage INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT,
                    updated_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
            ";

            await using var cmd = new SqliteCommand(createTableSql, conn);
            await cmd.ExecuteNonQueryAsync();
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
                    SavePath = reader.IsDBNull(reader.GetOrdinal("save_path")) ? "" : reader.GetString(reader.GetOrdinal("save_path")),
                    StatusDetail = reader.IsDBNull(reader.GetOrdinal("status_detail")) ? "" : reader.GetString(reader.GetOrdinal("status_detail")),
                    Subline = reader.IsDBNull(reader.GetOrdinal("subline")) ? "" : reader.GetString(reader.GetOrdinal("subline")),
                    FooterDetail = reader.IsDBNull(reader.GetOrdinal("footer_detail")) ? "" : reader.GetString(reader.GetOrdinal("footer_detail")),
                    FooterRight = reader.IsDBNull(reader.GetOrdinal("footer_right")) ? "" : reader.GetString(reader.GetOrdinal("footer_right")),
                    IsStorage = reader.GetInt32(reader.GetOrdinal("is_storage")) == 1
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
                    parallel_threads, active_mirrors, eta_seconds, sha256_hash, save_path,
                    status_detail, subline, footer_detail, footer_right, is_storage, created_at, updated_at
                ) VALUES (
                    @id, @title, @url, @domain, @total_bytes, @downloaded_bytes, @speed_mbps,
                    @progress_percentage, @status, @category, @icon_source, @icon_bg, @secondary_badge,
                    @parallel_threads, @active_mirrors, @eta_seconds, @sha256_hash, @save_path,
                    @status_detail, @subline, @footer_detail, @footer_right, @is_storage, @created_at, @updated_at
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
                    save_path = @save_path,
                    status_detail = @status_detail,
                    subline = @subline,
                    footer_detail = @footer_detail,
                    footer_right = @footer_right,
                    is_storage = @is_storage,
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
            cmd.Parameters.AddWithValue("@save_path", dl.SavePath ?? "");
            cmd.Parameters.AddWithValue("@status_detail", dl.StatusDetail ?? "");
            cmd.Parameters.AddWithValue("@subline", dl.Subline ?? "");
            cmd.Parameters.AddWithValue("@footer_detail", dl.FooterDetail ?? "");
            cmd.Parameters.AddWithValue("@footer_right", dl.FooterRight ?? "");
            cmd.Parameters.AddWithValue("@is_storage", dl.IsStorage ? 1 : 0);
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
}

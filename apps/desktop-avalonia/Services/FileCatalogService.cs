using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace SmartDm.Desktop.Avalonia.Services;

public class FileCatalogService : IFileCatalogService
{
    private readonly string _connectionString;
    private readonly SemaphoreSlim _semaphore = new(1, 1);
    private bool _isInitialized = false;

    public FileCatalogService(string? dbPath = null)
    {
        if (string.IsNullOrWhiteSpace(dbPath))
        {
            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".smartdm");
            Directory.CreateDirectory(appDir);
            dbPath = Path.Combine(appDir, "smartdm.db");
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

            string createCatalogTableSql = @"
                CREATE TABLE IF NOT EXISTS file_catalog (
                    id TEXT PRIMARY KEY,
                    file_name TEXT NOT NULL,
                    file_path TEXT NOT NULL UNIQUE,
                    file_size INTEGER NOT NULL,
                    source_url TEXT,
                    sha256_hash TEXT,
                    drive_letter TEXT,
                    last_modified TEXT,
                    indexed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_catalog_filename ON file_catalog(file_name COLLATE NOCASE);
                CREATE INDEX IF NOT EXISTS idx_catalog_url ON file_catalog(source_url COLLATE NOCASE);
                CREATE INDEX IF NOT EXISTS idx_catalog_path ON file_catalog(file_path COLLATE NOCASE);
            ";

            await using var cmd = new SqliteCommand(createCatalogTableSql, conn);
            await cmd.ExecuteNonQueryAsync();
            _isInitialized = true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"FileCatalogService initialization error: {ex.Message}");
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task IndexFileAsync(string filePath, string? sourceUrl = null, string? sha256 = null)
    {
        if (string.IsNullOrWhiteSpace(filePath)) return;

        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            string fileName = Path.GetFileName(filePath);
            long fileSize = 0;
            string lastModified = DateTime.UtcNow.ToString("o");
            string root = Path.GetPathRoot(filePath) ?? "C:\\";
            string driveLetter = root.Replace("\\", "");

            if (File.Exists(filePath))
            {
                var fi = new FileInfo(filePath);
                fileSize = fi.Length;
                lastModified = fi.LastWriteTimeUtc.ToString("o");
            }

            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            string sql = @"
                INSERT INTO file_catalog (id, file_name, file_path, file_size, source_url, sha256_hash, drive_letter, last_modified, indexed_at)
                VALUES (@id, @fileName, @filePath, @fileSize, @sourceUrl, @sha256, @driveLetter, @lastModified, @indexedAt)
                ON CONFLICT(file_path) DO UPDATE SET
                    file_name = excluded.file_name,
                    file_size = excluded.file_size,
                    source_url = COALESCE(excluded.source_url, file_catalog.source_url),
                    sha256_hash = COALESCE(excluded.sha256_hash, file_catalog.sha256_hash),
                    last_modified = excluded.last_modified,
                    indexed_at = excluded.indexed_at;
            ";

            await using var cmd = new SqliteCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
            cmd.Parameters.AddWithValue("@fileName", fileName);
            cmd.Parameters.AddWithValue("@filePath", filePath);
            cmd.Parameters.AddWithValue("@fileSize", fileSize);
            cmd.Parameters.AddWithValue("@sourceUrl", (object?)sourceUrl ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@sha256", (object?)sha256 ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@driveLetter", driveLetter);
            cmd.Parameters.AddWithValue("@lastModified", lastModified);
            cmd.Parameters.AddWithValue("@indexedAt", DateTime.UtcNow.ToString("o"));

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error indexing file: {ex.Message}");
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<CatalogMatch?> FindDuplicateAsync(string? url, string? fileName)
    {
        await InitializeAsync();
        await _semaphore.WaitAsync();
        try
        {
            await using var conn = new SqliteConnection(_connectionString);
            await conn.OpenAsync();

            // 1. Check exact URL match
            if (!string.IsNullOrWhiteSpace(url))
            {
                string queryUrl = url.Trim();
                string sqlUrl = "SELECT file_name, file_path, file_size, source_url, drive_letter FROM file_catalog WHERE source_url = @url COLLATE NOCASE LIMIT 10;";
                await using var cmdUrl = new SqliteCommand(sqlUrl, conn);
                cmdUrl.Parameters.AddWithValue("@url", queryUrl);

                await using var reader = await cmdUrl.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    string fPath = reader.GetString(1);
                    if (File.Exists(fPath))
                    {
                        return new CatalogMatch(
                            reader.GetString(0),
                            fPath,
                            reader.GetInt64(2),
                            reader.IsDBNull(3) ? null : reader.GetString(3),
                            "Exact Download URL & File Match",
                            reader.GetString(4),
                            true
                        );
                    }
                }
            }

            // 2. Check exact File Name match across all drives
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                string targetName = fileName.Trim();
                string sqlName = "SELECT file_name, file_path, file_size, source_url, drive_letter FROM file_catalog WHERE file_name = @fileName COLLATE NOCASE LIMIT 10;";
                await using var cmdName = new SqliteCommand(sqlName, conn);
                cmdName.Parameters.AddWithValue("@fileName", targetName);

                await using var reader = await cmdName.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    string fPath = reader.GetString(1);
                    if (File.Exists(fPath))
                    {
                        long size = reader.GetInt64(2);
                        string drive = reader.GetString(4);
                        return new CatalogMatch(
                            reader.GetString(0),
                            fPath,
                            size,
                            reader.IsDBNull(3) ? null : reader.GetString(3),
                            $"Identical File Already Exists on Drive {drive}",
                            drive,
                            true
                        );
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error finding duplicate: {ex.Message}");
        }
        finally
        {
            _semaphore.Release();
        }

        return null;
    }

    public string GenerateUniquePath(string targetPath, Func<string, bool>? isPathInUse = null)
    {
        bool inUse = !string.IsNullOrWhiteSpace(targetPath) && (File.Exists(targetPath) || (isPathInUse != null && isPathInUse(targetPath)));
        if (string.IsNullOrWhiteSpace(targetPath) || !inUse)
        {
            return targetPath;
        }

        string? dir = Path.GetDirectoryName(targetPath);
        if (string.IsNullOrEmpty(dir))
        {
            dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        }

        string fileNameWithoutExt = Path.GetFileNameWithoutExtension(targetPath);
        string ext = Path.GetExtension(targetPath);

        // Strip any existing " (1)", " (2)" suffix to avoid "video (1) (1).mp4"
        var matchSuffix = System.Text.RegularExpressions.Regex.Match(fileNameWithoutExt, @"^(.*?)\s*\(\d+\)$");
        if (matchSuffix.Success)
        {
            fileNameWithoutExt = matchSuffix.Groups[1].Value.Trim();
        }

        int counter = 1;
        while (counter < 1000)
        {
            string candidate = Path.Combine(dir, $"{fileNameWithoutExt} ({counter}){ext}");
            bool candidateInUse = File.Exists(candidate) || (isPathInUse != null && isPathInUse(candidate));
            if (!candidateInUse)
            {
                return candidate;
            }
            counter++;
        }

        return Path.Combine(dir, $"{fileNameWithoutExt}_{Guid.NewGuid().ToString("N")[..6]}{ext}");
    }

    public async Task ScanCommonFoldersAsync(CancellationToken ct = default)
    {
        await InitializeAsync();

        await Task.Run(async () =>
        {
            var searchPaths = new List<string>();

            // User Downloads
            string userDownloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (Directory.Exists(userDownloads)) searchPaths.Add(userDownloads);

            // User Desktop
            string userDesktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            if (Directory.Exists(userDesktop)) searchPaths.Add(userDesktop);

            // Drives Common Downloads (e.g. D:\Downloads, E:\Downloads)
            foreach (var drive in DriveInfo.GetDrives())
            {
                try
                {
                    if (drive.IsReady)
                    {
                        string dl1 = Path.Combine(drive.RootDirectory.FullName, "Downloads");
                        if (Directory.Exists(dl1) && !searchPaths.Contains(dl1)) searchPaths.Add(dl1);
                    }
                }
                catch { }
            }

            foreach (var folder in searchPaths)
            {
                if (ct.IsCancellationRequested) break;
                try
                {
                    var options = new EnumerationOptions
                    {
                        IgnoreInaccessible = true,
                        RecurseSubdirectories = false,
                        ReturnSpecialDirectories = false
                    };

                    foreach (var file in Directory.EnumerateFiles(folder, "*.*", options))
                    {
                        if (ct.IsCancellationRequested) break;
                        try
                        {
                            await IndexFileAsync(file);
                        }
                        catch { }
                    }
                }
                catch { }
            }
        }, ct);
    }
}

namespace SmartDm.Domain;

public enum DownloadState
{
    Queued,
    Probing,
    Downloading,
    Paused,
    Completed,
    Failed,
    Quarantined,
    Cancelled
}

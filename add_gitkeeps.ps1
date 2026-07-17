$root = "E:\skill\smartdm"
$dirs = Get-ChildItem -Path $root -Recurse -Directory -Force | Where-Object { $_.FullName -notmatch '\\\.git(\\|$)' }
foreach ($d in $dirs) {
    $items = Get-ChildItem -Path $d.FullName -Force
    if ($items.Count -eq 0) {
        New-Item -ItemType File -Path (Join-Path $d.FullName ".gitkeep") -Force
    }
}

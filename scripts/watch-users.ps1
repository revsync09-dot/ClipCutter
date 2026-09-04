$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot "backend\storage\logs\presence.ndjson"

Write-Host "ClipForge Live-Nutzer" -ForegroundColor Magenta
Write-Host "Warte auf den ersten angemeldeten Besucher ..." -ForegroundColor DarkGray

while ($true) {
    if (Test-Path -LiteralPath $logPath) {
        $cutoff = (Get-Date).ToUniversalTime().AddSeconds(-90)
        $latest = @{}
        Get-Content -LiteralPath $logPath -Tail 2000 | ForEach-Object {
            try {
                $entry = $_ | ConvertFrom-Json
                $latest[$entry.user_id] = $entry
            } catch {
                # Ignore an incomplete line while the server is appending it.
            }
        }
        Clear-Host
        Write-Host "ClipForge Live-Nutzer" -ForegroundColor Magenta
        Write-Host ("Aktualisiert: {0}  |  Online = Aktiv in den letzten 90 Sekunden" -f (Get-Date -Format "HH:mm:ss")) -ForegroundColor DarkGray
        Write-Host ""
        $rows = foreach ($entry in $latest.Values) {
            $seen = [DateTimeOffset]::Parse($entry.seen_at)
            if ($seen.UtcDateTime -ge $cutoff) {
                [PSCustomObject]@{
                    Status = "ONLINE"
                    Benutzer = if ($entry.email) { $entry.email } else { $entry.user_id }
                    IP = $entry.ip
                    Bereich = $entry.page
                    Zuletzt = $seen.ToLocalTime().ToString("HH:mm:ss")
                }
            }
        }
        if ($rows) {
            $rows | Sort-Object Benutzer | Format-Table -AutoSize
        } else {
            Write-Host "Gerade ist niemand aktiv." -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "Strg+C beendet die Anzeige. Protokolle werden nach 24 Stunden entfernt." -ForegroundColor DarkGray
    }
    Start-Sleep -Seconds 5
}

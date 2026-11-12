# TeleStremio installer for Windows.
#   irm https://weebzone.github.io/TeleStremio/install.ps1 | iex
# Finds the newest TeleStremio .msi on the Telegram-Stremio releases and installs it for you.
# Set $env:TELESTREMIO_DRY_RUN = "1" to only print what it would download.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is far faster without the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = if ($env:TELESTREMIO_REPO) { $env:TELESTREMIO_REPO } else { "weebzone/Telegram-Stremio" }
function Say($text) { Write-Host $text -ForegroundColor Cyan }

if (-not [Environment]::Is64BitOperatingSystem) { throw "TeleStremio for Windows needs 64-bit Windows 10 or 11." }

Say "Looking for the newest TeleStremio for Windows..."
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=20" -Headers @{ Accept = "application/vnd.github+json" }
$asset = $null
foreach ($r in $releases) {
    $asset = $r.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
    if ($asset) { break }
}
if (-not $asset) { throw "There is no Windows build on the $repo releases yet." }

$msi = Join-Path $env:TEMP $asset.name
Say "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB)) MB)"
if ($env:TELESTREMIO_DRY_RUN -eq "1") { Write-Host "  (dry run) $($asset.browser_download_url)"; return }
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $msi -UseBasicParsing

Say "Installing (Windows may ask for permission)"
$p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /passive /norestart" -Wait -PassThru
Remove-Item $msi -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "The installer stopped with code $($p.ExitCode)." }

Say "Done. Open TeleStremio from the Start menu."

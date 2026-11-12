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
# One API call (GitHub allows 60 anonymous calls an hour per address; GITHUB_TOKEN lifts that).
# If the API refuses, read the latest release's asset list from the regular web page instead.
$headers = @{ Accept = "application/vnd.github+json" }
if ($env:GITHUB_TOKEN) { $headers.Authorization = "Bearer $env:GITHUB_TOKEN" }
try {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=20" -Headers $headers
} catch {
    $page = Invoke-WebRequest -Uri "https://github.com/$repo/releases/latest" -UseBasicParsing
    $final = if ($page.BaseResponse.ResponseUri) { $page.BaseResponse.ResponseUri.AbsoluteUri } else { $page.BaseResponse.RequestMessage.RequestUri.AbsoluteUri }
    $tag = ($final -split "/releases/tag/")[1]
    if (-not $tag) { throw "Couldn't read the $repo releases from GitHub; check your connection and try again." }
    $html = (Invoke-WebRequest -Uri "https://github.com/$repo/releases/expanded_assets/$tag" -UseBasicParsing).Content
    $assets = [regex]::Matches($html, 'href="(/[^"]*/releases/download/[^"]*)"') | ForEach-Object {
        $u = "https://github.com" + $_.Groups[1].Value
        [pscustomobject]@{ name = [IO.Path]::GetFileName($u); browser_download_url = $u; size = 0 }
    }
    $releases = @([pscustomobject]@{ assets = $assets })
}
# Prefer an installer for this machine's CPU; skip ones built for the other architecture.
$isArm = $env:PROCESSOR_ARCHITECTURE -eq "ARM64"
$other = if ($isArm) { "x64|amd64|x86_64" } else { "arm64|aarch64" }
$asset = $null
foreach ($r in $releases) {
    $msis = @($r.assets | Where-Object { $_.name -like "*.msi" -and $_.name -notmatch $other })
    $asset = ($msis | Where-Object { $_.name -match $(if ($isArm) { "arm64|aarch64" } else { "x64|amd64|x86_64" }) } | Select-Object -First 1)
    if (-not $asset) { $asset = $msis | Select-Object -First 1 }
    if ($asset) { break }
}
if (-not $asset) { throw "There is no Windows build on the $repo releases yet." }

$msi = Join-Path $env:TEMP $asset.name
Say ("Downloading $($asset.name)" + $(if ($asset.size) { " ($([math]::Round($asset.size / 1MB)) MB)" } else { "" }))
if ($env:TELESTREMIO_DRY_RUN -eq "1") { Write-Host "  (dry run) $($asset.browser_download_url)"; return }
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $msi -UseBasicParsing

Say "Installing (Windows may ask for permission)"
$p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /passive /norestart" -Wait -PassThru
Remove-Item $msi -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "The installer stopped with code $($p.ExitCode)." }

Say "Done. Open TeleStremio from the Start menu."

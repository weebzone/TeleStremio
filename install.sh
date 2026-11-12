#!/bin/sh
# TeleStremio installer for macOS and Linux.
#   curl -fsSL https://weebzone.github.io/TeleStremio/install.sh | sh
# Finds the newest TeleStremio desktop build on the Telegram-Stremio releases and installs it:
#   macOS (Apple Silicon): the .dmg's app into /Applications
#   Debian / Ubuntu (x64): the .deb through apt
#   other Linux (x64):     the jar into ~/.local/share/telestremio with a launcher and menu entry
# Set TELESTREMIO_DRY_RUN=1 to only print what it would download.
set -eu

REPO="${TELESTREMIO_REPO:-weebzone/Telegram-Stremio}"
API="https://api.github.com/repos/$REPO/releases?per_page=20"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'TeleStremio installer: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "this needs '$1' — install it and run again"; }

need curl
os=$(uname -s); arch=$(uname -m)

# Release assets whose names match $1 (an extended regex), newest release first.
asset_url() {
  curl -fsSL -H "Accept: application/vnd.github+json" "$API" \
    | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/' \
    | grep -E "$1"
}

fetch() { # url dest
  say "Downloading $(basename "$1")"
  if [ "${TELESTREMIO_DRY_RUN:-}" = "1" ]; then echo "  (dry run) $1"; return; fi
  curl -fL --progress-bar -o "$2" "$1"
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

case "$os" in
  Darwin)
    [ "$arch" = "arm64" ] || die "the macOS build is for Apple Silicon (M1 and newer); this Mac is $arch"
    # Apple Silicon or universal images only (skip Intel-only ones).
    url=$(asset_url '\.dmg$' | grep -viE 'x64|x86_64|intel' | head -n 1) || true
    [ -n "${url:-}" ] || url=$(asset_url '\.dmg$' | head -n 1) || true
    [ -n "${url:-}" ] || die "no macOS build on the $REPO releases yet"
    fetch "$url" "$tmp/TeleStremio.dmg"
    [ "${TELESTREMIO_DRY_RUN:-}" = "1" ] && exit 0
    mnt=$(hdiutil attach -nobrowse -readonly "$tmp/TeleStremio.dmg" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
    app=$(find "$mnt" -maxdepth 1 -name '*.app' | head -n 1)
    [ -n "$app" ] || { hdiutil detach "$mnt" -quiet; die "the disk image has no app inside"; }
    say "Installing into /Applications"
    rm -rf "/Applications/$(basename "$app")"
    cp -R "$app" /Applications/
    hdiutil detach "$mnt" -quiet || true
    # Not notarized yet: clear the download quarantine so it opens without the Gatekeeper prompt.
    xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
    say "Done. Open TeleStremio from Applications or Launchpad."
    ;;

  Linux)
    [ "$arch" = "x86_64" ] || die "the Linux build is for 64-bit x86; this machine is $arch"
    if command -v apt-get >/dev/null 2>&1; then
      url=$(asset_url '_amd64\.deb$' | head -n 1) || true
      [ -n "${url:-}" ] || die "no Linux build on the $REPO releases yet"
      fetch "$url" "$tmp/telestremio.deb"
      [ "${TELESTREMIO_DRY_RUN:-}" = "1" ] && exit 0
      say "Installing the package (asks for your password)"
      if [ "$(id -u)" -eq 0 ]; then apt-get install -y "$tmp/telestremio.deb"; else sudo apt-get install -y "$tmp/telestremio.deb"; fi
      say "Done. Open TeleStremio from your app menu."
    else
      need java
      jv=$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)
      [ "${jv:-0}" -ge 17 ] 2>/dev/null || die "Java 17 or newer is needed (found ${jv:-none})"
      jar=$(asset_url 'telestremio-linux-x64\.jar$' | head -n 1) || true
      lib=$(asset_url '/libtdjni\.so$' | head -n 1) || true
      [ -n "${jar:-}" ] && [ -n "${lib:-}" ] || die "no Linux jar on the $REPO releases yet"
      dest="$HOME/.local/share/telestremio/app"
      mkdir -p "$dest" "$HOME/.local/bin" "$HOME/.local/share/applications"
      fetch "$jar" "$dest/telestremio.jar"
      fetch "$lib" "$dest/libtdjni.so"
      [ "${TELESTREMIO_DRY_RUN:-}" = "1" ] && exit 0
      cat > "$HOME/.local/bin/telestremio" <<EOF
#!/bin/sh
TELESTREMIO_TDJNI="$dest/libtdjni.so" exec java -Xmx512m -jar "$dest/telestremio.jar" "\$@"
EOF
      chmod +x "$HOME/.local/bin/telestremio"
      cat > "$HOME/.local/share/applications/telestremio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=TeleStremio
Comment=Stream your Telegram channels in Stremio
Exec=$HOME/.local/bin/telestremio
Categories=AudioVideo;Network;
Terminal=false
EOF
      say "Done. Run 'telestremio' (or 'telestremio --headless' on a server), or open it from your app menu."
    fi
    ;;

  *) die "this script covers macOS and Linux; on Windows run: irm https://weebzone.github.io/TeleStremio/install.ps1 | iex" ;;
esac

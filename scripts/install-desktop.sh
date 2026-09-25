#!/usr/bin/env bash
# Generates and installs a .desktop entry (plus icon) for mdedit, so it shows up in the
# app launcher and in "Open with" for Markdown files.
#
# Usage: scripts/install-desktop.sh [path-to-mdedit-binary]
#   Default binary: ~/.local/bin/mdedit, falling back to this repo's release build.
#   Set MDEDIT_SET_DEFAULT=1 to also make mdedit the default app for Markdown files.
set -euo pipefail
cd "$(dirname "$0")/.."

bin="${1:-}"
if [[ -z "$bin" ]]; then
  if [[ -x "$HOME/.local/bin/mdedit" ]]; then
    bin="$HOME/.local/bin/mdedit"
  else
    bin="$PWD/src-tauri/target/release/mdedit"
  fi
fi
bin="$(realpath "$bin")"
[[ -x "$bin" ]] || { echo "mdedit binary not found at $bin — build it first (npx tauri build --no-bundle)" >&2; exit 1; }

apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"

for size in 32x32 128x128; do
  install -Dm644 "src-tauri/icons/$size.png" "$icons/$size/apps/mdedit.png"
done
install -Dm644 src-tauri/icons/128x128@2x.png "$icons/256x256/apps/mdedit.png"

install -Dm644 /dev/stdin "$apps/mdedit.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=mdedit
GenericName=Markdown Editor
Comment=Lightweight Markdown editor with live preview
Exec="$bin" %F
TryExec=$bin
Icon=mdedit
Terminal=false
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;
Keywords=markdown;md;editor;preview;
StartupWMClass=mdedit
DESKTOP

update-desktop-database "$apps" 2>/dev/null || true
gtk-update-icon-cache -q "$icons" 2>/dev/null || true

if [[ "${MDEDIT_SET_DEFAULT:-0}" == 1 ]]; then
  xdg-mime default mdedit.desktop text/markdown text/x-markdown
  echo "mdedit is now the default app for Markdown files."
fi

echo "Installed $apps/mdedit.desktop (Exec: $bin)"
command -v desktop-file-validate >/dev/null && desktop-file-validate "$apps/mdedit.desktop" || true

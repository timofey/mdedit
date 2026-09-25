#!/usr/bin/env bash
# Builds mdedit and installs it for the current user:
#   ~/.local/bin/mdedit, a .desktop entry (so "Open with" works for .md files) and an icon.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install
npx tauri build --no-bundle

install -Dm755 src-tauri/target/release/mdedit "$HOME/.local/bin/mdedit"
install -Dm644 src-tauri/icons/128x128.png "$HOME/.local/share/icons/hicolor/128x128/apps/mdedit.png"
install -Dm644 /dev/stdin "$HOME/.local/share/applications/mdedit.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=mdedit
GenericName=Markdown Editor
Comment=Lightweight Markdown editor with live preview
Exec=$HOME/.local/bin/mdedit %F
Icon=mdedit
Terminal=false
Categories=Utility;TextEditor;Development;
MimeType=text/markdown;text/x-markdown;
StartupWMClass=mdedit
DESKTOP

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed: $HOME/.local/bin/mdedit"
echo "Optional: make it the default for Markdown:  xdg-mime default mdedit.desktop text/markdown"

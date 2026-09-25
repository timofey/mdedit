#!/usr/bin/env bash
# Builds mdedit and installs it for the current user:
#   ~/.local/bin/mdedit, plus a .desktop entry and icon (via install-desktop.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

npm install
npx tauri build --no-bundle

install -Dm755 src-tauri/target/release/mdedit "$HOME/.local/bin/mdedit"
scripts/install-desktop.sh "$HOME/.local/bin/mdedit"
echo "Installed: $HOME/.local/bin/mdedit"

# mdedit

A small, fast Markdown editor for Linux: Tauri 2 + CodeMirror 6 + markdown-it.

- GitHub-flavored rendering: tables, task lists, footnotes, alerts (`> [!NOTE]`), emoji,
  front matter, definition lists, sub/sup/mark, KaTeX math (`$…$`, `$$…$$`, ```` ```math ````),
  Mermaid diagrams, and highlight.js syntax highlighting for fenced code (all languages)
- Tabs, a sidebar listing the Markdown files in the current file's folder (live-updated)
- Source / Split / Preview modes with synchronized scrolling
- One-click export to a standalone `.html` next to the file (styles inlined, images embedded)
- Reloads files changed on disk, and asks before overwriting when you have unsaved edits

## Install

```sh
./scripts/install-local.sh     # builds and installs ~/.local/bin/mdedit + desktop entry
mdedit README.md notes.md      # opens files; a running instance gets new tabs
```

## Shortcuts

| Keys | Action |
|---|---|
| Ctrl+N / Ctrl+O | New / Open |
| Ctrl+S / Ctrl+Shift+S | Save / Save As |
| Ctrl+W | Close tab |
| Ctrl+Tab, Ctrl+PgDn / Ctrl+Shift+Tab, Ctrl+PgUp | Next / previous tab |
| Ctrl+1 / 2 / 3 | Source / Split / Preview |
| Ctrl+B | Toggle sidebar |
| Ctrl+E | Export HTML |
| Ctrl+F | Find / replace |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom |

## Development

```sh
npm install
npm run tauri dev -- -- path/to/file.md
npm test                       # renderer tests
```

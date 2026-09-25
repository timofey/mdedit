# Plan: Lightweight Markdown Editor (Tauri 2)

## Context
The user wants a fast, simple desktop Markdown editor for Linux. Existing tools fall short: MarkText breaks code blocks, Ghostwriter hangs and mis-renders, and IntelliJ renders well but is heavy and its preview scrolls badly. Goals: rendering as accurate as IntelliJ's (GFM tables, fenced code with syntax highlighting, and the rest), tabs, a sidebar listing the folder's `.md` files, three view modes (source / split / preview), and one-click HTML export.

The directory `/home/timofey/repos/markdown-editor` is empty (greenfield). The toolchain is present: Rust 1.98, Node 20, npm, webkit2gtk-4.1 2.52, libsoup3.

## Stack (why)
- **Tauri 2** (Rust shell + system WebKitGTK webview): about a 10 MB binary, starts quickly, low RAM. Electron would also work but is about 10× heavier.
- **Frontend: Vite + TypeScript, no UI framework.** The UI is small, so plain TS keeps it fast and easy to follow.
- **Editor: CodeMirror 6** (`@codemirror/lang-markdown` with `codeLanguages` from `@codemirror/language-data`). Code inside fences gets highlighted in the source too. Also: line numbers, search (Ctrl+F), soft wrap, and undo history kept per tab.
- **Renderer: markdown-it**, the same CommonMark-compliant engine family VS Code uses, with plugins:
  - built in: GFM tables, strikethrough, linkify, typographer off
  - `markdown-it-task-lists`, `markdown-it-footnote`, `markdown-it-deflist`, `markdown-it-sub`/`sup`, `markdown-it-mark`, `markdown-it-emoji`
  - `markdown-it-anchor` (heading ids so `#links` work), `markdown-it-front-matter` (hidden or shown as a code block)
  - `markdown-it-github-alerts` (`> [!NOTE]` and similar)
  - `@vscode/markdown-it-katex` + KaTeX for `$…$` and `$$…$$` math
  - **highlight.js** (all languages, synchronous) for fenced code, plus a copy button and a language label on each block
  - **mermaid** fences, lazy-loaded, rendered to SVG, cached by source hash so typing doesn't re-render unchanged diagrams
- **Styling:** `github-markdown-css` (light and dark, follows the system theme) and matching highlight.js GitHub themes.
- **Sanitising:** DOMPurify on the rendered HTML. Raw HTML in Markdown (`<details>`, `<kbd>`, `<img>`) still works, but scripts don't run.

## Project layout
```
markdown-editor/
  package.json, vite.config.ts, tsconfig.json, index.html
  src/
    main.ts          – app bootstrap, keyboard shortcuts, layout wiring
    tabs.ts          – Tab model {path, name, EditorState, savedDoc, dirty}; tab bar UI
    editor.ts        – CodeMirror setup (one EditorView; swaps EditorState per tab)
    render.ts        – markdown-it instance + plugins + highlight; md → sanitized HTML with data-line attrs
    preview.ts       – debounced (~120 ms) render into preview pane, mermaid pass, image path rewrite, link handling
    scrollsync.ts    – editor↔preview scroll sync using data-line anchors (interpolated)
    sidebar.ts       – list .md files of active file's folder, highlight current, click → open tab
    viewmode.ts      – source | split | preview modes, draggable splitter, persisted in localStorage
    export.ts        – build a standalone HTML document and save it
    fs.ts            – thin wrappers around Tauri invoke()
    styles/app.css
    tests/render.test.ts + fixtures/all-features.md
  src-tauri/
    Cargo.toml, tauri.conf.json, capabilities/default.json
    src/main.rs, src/lib.rs – commands + plugins
```

## Rust backend (`src-tauri/src/lib.rs`)
Commands:
- `read_file(path) -> String`, `write_file(path, content)` (atomic: write to a temp file, then rename)
- `list_md_files(dir) -> Vec<{name, path}>`: `.md`/`.markdown` files, sorted case-insensitively
- `write_export(path, html)`
- `initial_files() -> Vec<String>`: absolute paths passed on the command line (`mdedit foo.md bar.md`)

Plugins:
- `tauri-plugin-dialog`: Open, Save As, and "unsaved changes" confirmations
- `tauri-plugin-opener`: external links open in the system browser, and "Open exported HTML"
- `tauri-plugin-single-instance`: running `mdedit other.md` while the app is open adds a tab to the existing window
- `notify` crate: watches the active folder. Emits a `folder-changed` event so the sidebar refreshes, and `file-changed` for open tabs. A clean tab reloads silently; a dirty tab shows a "file changed on disk" bar.

Asset protocol enabled (scope `**`) so relative images in the Markdown load through `convertFileSrc`.

Linux workaround: if `WEBKIT_DISABLE_DMABUF_RENDERER` is unset, `main.rs` sets it to `1`. This avoids blank or flickering windows with WebKitGTK on NVIDIA, and the machine has `/opt/cuda`.

## UI and behaviour
- **Layout:** toolbar (Open, Save, view-mode 3-way toggle, Export HTML, sidebar toggle) / tab bar / [sidebar | editor | splitter | preview].
- **Tabs:** click to switch, middle-click or × to close, `*` marks unsaved changes, and closing a dirty tab asks first. Ctrl+Tab and Ctrl+Shift+Tab cycle tabs. Opening a file that's already open focuses its tab. Open tabs and the active tab are restored on the next launch.
- **Sidebar:** lists the `.md` files in the active file's folder. The current file is highlighted; click opens it (or focuses its tab). The folder name is shown at the top. Ctrl+B toggles the sidebar.
- **View modes:** Ctrl+1 source, Ctrl+2 split, Ctrl+3 preview, plus the toolbar buttons. Split ratio can be dragged and is remembered.
- **Preview:** the scroll position is kept across re-renders. Scroll sync is one-directional by default (the editor drives the preview) and bidirectional when the preview is scrolled. Links:
  - `#anchor` links scroll within the preview
  - relative `.md` links open in a new tab
  - `http(s)` links open in the browser
  - relative image paths resolve against the file's folder
- **Shortcuts:** Ctrl+S save, Ctrl+Shift+S save as, Ctrl+O open, Ctrl+N new untitled, Ctrl+W close, Ctrl+E export.
- **Export HTML (one click / Ctrl+E):** writes `<name>.html` next to the `.md` file (Save As for untitled files). The result is a single standalone file:
  - inlined github-markdown-css and highlight.js theme, with light/dark via `prefers-color-scheme`
  - KaTeX CSS inlined, with fonts linked from the jsDelivr CDN to keep the file small
  - mermaid diagrams already rendered to SVG
  - local images embedded as base64 data URIs
  - no editor-only UI such as copy buttons

  A toast shows the saved path with an "Open" action.

## Install
`npm run tauri build` produces the binary, plus `.deb` and AppImage bundles. A small `scripts/install-local.sh` copies the binary to `~/.local/bin/mdedit` and installs a `.desktop` file with `MimeType=text/markdown;`, so "Open with" works from the file manager.

## Verification
1. `npm run test` (vitest): renders `fixtures/all-features.md` and checks the output for correct HTML:
   - headings, nested lists, task lists, tables with alignment
   - fenced code in several languages (hljs classes present) and code nested in lists and blockquotes
   - footnotes, math, alerts, HTML blocks, escaping edge cases
2. `cargo check` / `cargo clippy` in `src-tauri`; `npm run build` type-checks the frontend.
3. `npm run tauri dev` with the fixture file as an argument, then a manual check:
   - all three view modes, tabs, sidebar listing and click-to-open, scroll sync
   - Save/dirty markers, and an external edit reloading the file
   - Export: open the exported HTML in a browser and compare it to the preview
4. `npm run tauri build`, then run the release binary from the terminal on a single file to confirm it starts quickly.

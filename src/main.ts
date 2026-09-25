import "katex/dist/katex.min.css";
import "./styles/app.css";
import { EditorView } from "@codemirror/view";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog, save as saveDialog, message } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { createEditorState, createEditorView } from "./editor";
import { renderMarkdown } from "./render";
import { Preview } from "./preview";
import { ScrollSync } from "./scrollsync";
import { Sidebar } from "./sidebar";
import { ViewModes } from "./viewmode";
import { FontSettingsPanel } from "./fonts";
import { exportHtml } from "./export";
import { previewCss } from "./styles";
import { isDirty, renderTabBar, tabName, textOf, type Tab } from "./tabs";
import {
  basename,
  dirname,
  hasUrlScheme,
  initialFiles,
  isMarkdownPath,
  joinPath,
  readFile,
  resolvePath,
  watchDirs,
  writeFile,
} from "./fs";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const style = document.createElement("style");
style.textContent = previewCss;
document.head.append(style);

// ---------------------------------------------------------------- state

let tabs: Tab[] = [];
let active: Tab | null = null;
let nextId = 1;
let untitledCounter = 1;
let renderTimer = 0;
let previewStale = true;

const editorCallbacks = { onDocChanged: () => onDocChanged() };
const view: EditorView = createEditorView($("editor-pane"), createEditorState("", editorCallbacks));

const previewPane = $("preview-pane");
const previewEl = $("preview");
const preview = new Preview(previewPane, previewEl, {
  onLink: (href) => void followLink(href),
  onLayoutChange: () => sync.invalidate(),
});
const sync = new ScrollSync(view, previewPane, previewEl, () => modes.mode === "split");
const sidebar = new Sidebar($("sidebar-header"), $("sidebar-list"), (p) => void openFile(p));
const modes = new ViewModes($("panes"), $("mode-switch"), $("splitter"), () => {
  sync.invalidate();
  if (modes.showsPreview && previewStale) renderNow();
  if (modes.mode === "split") sync.syncFromEditor();
});

new FontSettingsPanel($("btn-fonts"), $("font-panel"), () => {
  view.requestMeasure();
  sync.invalidate();
});

// ---------------------------------------------------------------- helpers

function syncActive(): void {
  if (active) active.state = view.state;
}

function docText(t: Tab): string {
  return t.state.doc.sliceString(0, undefined, t.eol);
}

function tabDir(t: Tab | null): string | null {
  return t?.path ? dirname(t.path) : null;
}

let toastTimer = 0;
function toast(text: string, action?: { label: string; run: () => void }): void {
  const el = $("toast");
  el.replaceChildren(document.createTextNode(text));
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.addEventListener("click", () => {
      action.run();
      el.hidden = true;
    });
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 6000);
}

async function showError(text: string, err: unknown): Promise<void> {
  await message(`${text}\n\n${err instanceof Error ? err.message : String(err)}`, { title: "mdedit", kind: "error" });
}

// ---------------------------------------------------------------- rendering

function renderNow(): void {
  clearTimeout(renderTimer);
  if (!active || !modes.showsPreview) {
    previewStale = true;
    return;
  }
  preview.update(renderMarkdown(view.state.doc.toString()));
  previewStale = false;
}

function onDocChanged(): void {
  previewStale = true;
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderNow();
    if (modes.mode === "split") sync.syncFromEditor();
  }, 120);
  syncActive();
  refreshChrome();
}

function refreshChrome(): void {
  renderTabBar($("tabbar"), tabs, active, { onActivate: activate, onClose: (t) => void closeTab(t) });
  const name = active ? tabName(active) : "";
  const title = active ? `${isDirty(active) ? "• " : ""}${name} — mdedit` : "mdedit";
  if (document.title !== title) {
    document.title = title;
    void getCurrentWindow().setTitle(title);
  }
  $("disk-banner").hidden = !active?.diskChanged;
}

// ---------------------------------------------------------------- tabs

function makeTab(path: string | null, content: string): Tab {
  const state = createEditorState(content, editorCallbacks);
  return {
    id: nextId++,
    path,
    untitledName: path ? "" : `Untitled-${untitledCounter++}`,
    state,
    saved: state.doc,
    eol: content.includes("\r\n") ? "\r\n" : "\n",
    editorScroll: 0,
    previewScroll: 0,
    diskChanged: false,
  };
}

function activate(tab: Tab): void {
  if (active === tab) return;
  if (active) {
    syncActive();
    active.editorScroll = view.scrollDOM.scrollTop;
    active.previewScroll = previewPane.scrollTop;
  }
  active = tab;
  view.setState(tab.state);
  preview.reset(tabDir(tab));
  previewStale = true;
  renderNow();
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = tab.editorScroll;
    previewPane.scrollTop = tab.previewScroll;
  });
  view.focus();
  refreshChrome();
  void sidebar.show(tabDir(tab) ?? sidebar.folder, tab.path);
  persistSession();
}

function isPristineUntitled(t: Tab): boolean {
  return !t.path && t.state.doc.length === 0 && !isDirty(t);
}

/** Opens `path` in a tab. With `createIfMissing` (command-line use) a missing file opens empty. */
async function openFile(path: string, createIfMissing = false): Promise<void> {
  const existing = tabs.find((t) => t.path === path);
  if (existing) return activate(existing);
  let content: string;
  try {
    content = await readFile(path);
  } catch (e) {
    if (!createIfMissing || !/no such file|not found/i.test(String(e))) {
      return showError(`Could not open ${path}`, e);
    }
    content = "";
  }
  const again = tabs.find((t) => t.path === path); // opened concurrently
  if (again) return activate(again);

  const tab = makeTab(path, content);
  syncActive();
  if (active && isPristineUntitled(active)) {
    tabs[tabs.indexOf(active)] = tab;
    active = null;
  } else {
    const at = active ? tabs.indexOf(active) + 1 : tabs.length;
    tabs.splice(at, 0, tab);
  }
  activate(tab);
  updateWatches();
}

function newTab(): void {
  const tab = makeTab(null, "");
  tabs.push(tab);
  activate(tab);
}

async function confirmDiscard(tab: Tab): Promise<boolean> {
  syncActive();
  if (!isDirty(tab)) return true;
  if (tab !== active) activate(tab);
  const answer = await message(`Save changes to "${tabName(tab)}" before closing?`, {
    title: "Unsaved changes",
    kind: "warning",
    buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
  });
  if (answer === "Save" || answer === "Yes") return saveTab(tab);
  return answer === "Don't Save" || answer === "No";
}

async function closeTab(tab: Tab): Promise<void> {
  if (!(await confirmDiscard(tab))) return;
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  if (active === tab) {
    active = null;
    if (tabs.length) activate(tabs[Math.min(i, tabs.length - 1)]);
    else newTab();
  } else {
    refreshChrome();
    persistSession();
  }
  updateWatches();
}

function cycleTab(delta: number): void {
  if (!active || tabs.length < 2) return;
  const i = tabs.indexOf(active);
  activate(tabs[(i + delta + tabs.length) % tabs.length]);
}

// ---------------------------------------------------------------- saving

async function saveTab(tab: Tab, saveAs = false): Promise<boolean> {
  syncActive();
  let path = tab.path;
  if (!path || saveAs) {
    const chosen = await saveDialog({
      title: "Save Markdown file",
      defaultPath: tab.path ?? (sidebar.folder ? joinPath(sidebar.folder, `${tab.untitledName}.md`) : `${tab.untitledName}.md`),
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (!chosen) return false;
    path = chosen;
  }
  const doc = tab.state.doc;
  try {
    await writeFile(path, docText(tab));
  } catch (e) {
    await showError(`Could not save ${path}`, e);
    return false;
  }
  const pathChanged = path !== tab.path;
  tab.path = path;
  tab.saved = doc;
  tab.diskChanged = false;
  refreshChrome();
  if (pathChanged) {
    if (tab === active) {
      preview.reset(tabDir(tab));
      renderNow();
    }
    persistSession();
    updateWatches();
  }
  if (tab === active) void sidebar.show(tabDir(tab), tab.path, true);
  return true;
}

async function openWithDialog(): Promise<void> {
  const chosen = await openDialog({
    multiple: true,
    directory: false,
    defaultPath: sidebar.folder ?? undefined,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
  for (const p of paths) await openFile(p);
}

// ---------------------------------------------------------------- export

async function exportActive(): Promise<void> {
  if (!active) return;
  syncActive();
  if (!active.path) {
    toast("Save the file first — the HTML is written next to it.");
    if (!(await saveTab(active))) return;
  }
  const tab = active;
  try {
    const out = await exportHtml(docText(tab), tab.path!, dirname(tab.path!), tabName(tab));
    toast(`Exported ${basename(out)}`, { label: "Open", run: () => void openPath(out) });
  } catch (e) {
    await showError("Export failed", e);
  }
}

// ---------------------------------------------------------------- links

async function followLink(href: string): Promise<void> {
  if (hasUrlScheme(href)) {
    if (/^(https?|mailto):/i.test(href)) await openUrl(href);
    return;
  }
  const base = tabDir(active);
  if (!base) return;
  const [pathPart, hash] = href.split("#", 2);
  const target = resolvePath(base, pathPart);
  if (isMarkdownPath(target)) {
    await openFile(target);
    if (hash) setTimeout(() => preview.scrollToAnchor(hash), 50);
  } else {
    await openPath(target).catch((e) => showError(`Could not open ${target}`, e));
  }
}

// ---------------------------------------------------------------- external changes

let watchedKey = "";
function updateWatches(): void {
  const dirs = [...new Set(tabs.map((t) => tabDir(t)).filter((d): d is string => !!d))].sort();
  const key = dirs.join("\n");
  if (key === watchedKey) return;
  watchedKey = key;
  void watchDirs(dirs);
}

const pendingChanges = new Set<string>();
let changeTimer = 0;

async function handleFsChanges(): Promise<void> {
  const changed = [...pendingChanges];
  pendingChanges.clear();
  syncActive();

  if (sidebar.folder && changed.some((p) => dirname(p) === sidebar.folder)) {
    void sidebar.show(sidebar.folder, active?.path ?? null, true);
  }

  for (const tab of tabs) {
    if (!tab.path || !changed.includes(tab.path)) continue;
    let content: string;
    try {
      content = await readFile(tab.path);
    } catch {
      continue; // deleted or moved; keep the buffer as-is
    }
    const disk = textOf(content);
    if (disk.eq(tab.saved)) continue;
    if (disk.eq(tab.state.doc)) {
      tab.saved = tab.state.doc; // e.g. our own save racing the watcher
    } else if (!isDirty(tab)) {
      replaceDoc(tab, content);
      tab.saved = tab.state.doc;
    } else {
      tab.diskChanged = true;
    }
  }
  refreshChrome();
}

function replaceDoc(tab: Tab, content: string): void {
  const head = Math.min(tab.state.selection.main.head, textOf(content).length);
  const spec = { changes: { from: 0, to: tab.state.doc.length, insert: content }, selection: { anchor: head } };
  if (tab === active) {
    view.dispatch(spec);
    tab.state = view.state;
  } else {
    tab.state = tab.state.update(spec).state;
  }
}

$("btn-reload").addEventListener("click", async () => {
  const tab = active;
  if (!tab?.path) return;
  try {
    const content = await readFile(tab.path);
    replaceDoc(tab, content);
    tab.saved = tab.state.doc;
  } catch (e) {
    await showError("Reload failed", e);
  }
  tab.diskChanged = false;
  refreshChrome();
});
$("btn-keep").addEventListener("click", () => {
  if (active) active.diskChanged = false;
  refreshChrome();
});

// ---------------------------------------------------------------- session / settings

const SESSION_KEY = "mdedit.session";

function persistSession(): void {
  const paths = tabs.map((t) => t.path).filter((p): p is string => !!p);
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ paths, active: active?.path ?? null }));
  } catch {
    /* ignore */
  }
}

function loadSession(): { paths: string[]; active: string | null } {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    if (s && Array.isArray(s.paths)) return s;
  } catch {
    /* ignore */
  }
  return { paths: [], active: null };
}

function setSidebarVisible(visible: boolean): void {
  document.body.classList.toggle("no-sidebar", !visible);
  try {
    localStorage.setItem("mdedit.sidebar", visible ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let zoom = 1;
function setZoom(z: number): void {
  zoom = Math.min(2, Math.max(0.6, Math.round(z * 10) / 10));
  document.documentElement.style.setProperty("--zoom", String(zoom));
  sync.invalidate();
  try {
    localStorage.setItem("mdedit.zoom", String(zoom));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- UI wiring

$("btn-new").addEventListener("click", newTab);
$("btn-open").addEventListener("click", () => void openWithDialog());
$("btn-save").addEventListener("click", () => active && void saveTab(active));
$("btn-export").addEventListener("click", () => void exportActive());
$("btn-sidebar").addEventListener("click", () => setSidebarVisible(document.body.classList.contains("no-sidebar")));

window.addEventListener(
  "keydown",
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const run = (fn: () => unknown) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    if (k === "s" && e.shiftKey) run(() => active && saveTab(active, true));
    else if (k === "s") run(() => active && saveTab(active));
    else if (k === "o") run(openWithDialog);
    else if (k === "n") run(newTab);
    else if (k === "w") run(() => active && closeTab(active));
    else if (k === "e" && !e.shiftKey) run(exportActive);
    else if (k === "b" && !e.shiftKey) run(() => setSidebarVisible(document.body.classList.contains("no-sidebar")));
    else if (k === "tab") run(() => cycleTab(e.shiftKey ? -1 : 1));
    else if (k === "pagedown") run(() => cycleTab(1));
    else if (k === "pageup") run(() => cycleTab(-1));
    else if (e.code === "Digit1") run(() => modes.set("source"));
    else if (e.code === "Digit2") run(() => modes.set("split"));
    else if (e.code === "Digit3") run(() => modes.set("preview"));
    else if (k === "=" || k === "+") run(() => setZoom(zoom + 0.1));
    else if (k === "-") run(() => setZoom(zoom - 0.1));
    else if (k === "0") run(() => setZoom(1));
  },
  { capture: true },
);

// Forward wheel+Ctrl zoom to our zoom instead of the webview's.
window.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
  },
  { passive: false },
);

const appWindow = getCurrentWindow();
let closing = false;
void appWindow.onCloseRequested(async (e) => {
  if (closing) return;
  syncActive();
  e.preventDefault();
  for (const t of tabs.filter(isDirty)) {
    if (!(await confirmDiscard(t))) return;
  }
  persistSession();
  closing = true;
  await appWindow.destroy();
});

void listen<string[]>("open-files", async (e) => {
  for (const p of e.payload) await openFile(p, true);
});

void listen<string[]>("fs-changed", (e) => {
  e.payload.forEach((p) => pendingChanges.add(p));
  clearTimeout(changeTimer);
  changeTimer = window.setTimeout(() => void handleFsChanges(), 200);
});

void getCurrentWebview().onDragDropEvent(async (e) => {
  if (e.payload.type !== "drop") return;
  for (const p of e.payload.paths) await openFile(p);
});

// ---------------------------------------------------------------- startup

async function start(): Promise<void> {
  try {
    const sb = localStorage.getItem("mdedit.sidebar");
    setSidebarVisible(sb !== "0");
    setZoom(Number(localStorage.getItem("mdedit.zoom")) || 1);
  } catch {
    setSidebarVisible(true);
  }

  const cli = await initialFiles().catch(() => [] as string[]);
  if (cli.length) {
    for (const p of cli) await openFile(p, true);
  } else {
    const session = loadSession();
    for (const p of session.paths) {
      try {
        const content = await readFile(p);
        tabs.push(makeTab(p, content));
      } catch {
        /* file is gone */
      }
    }
    const want = tabs.find((t) => t.path === session.active) ?? tabs[0];
    if (want) activate(want);
    updateWatches();
  }
  if (!tabs.length) newTab();
}

void start();

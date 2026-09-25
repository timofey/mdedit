import { invoke } from "@tauri-apps/api/core";

export interface MdFile {
  name: string;
  path: string;
}

export const readFile = (path: string) => invoke<string>("read_file", { path });
export const writeFile = (path: string, content: string) => invoke<void>("write_file", { path, content });
export const listMdFiles = (dir: string) => invoke<MdFile[]>("list_md_files", { dir });
export const watchDirs = (dirs: string[]) => invoke<void>("watch_dirs", { dirs });
export const initialFiles = () => invoke<string[]>("initial_files");

// Paths are handled as strings in the platform's own format: "/home/me/a.md" on
// Linux/macOS, "C:\Users\me\a.md" (or a UNC "\\server\share\...") on Windows.

const WIN_ROOT_RE = /^(?:[A-Za-z]:|\\\\[^\\/]+[\\/][^\\/]+)(?=[\\/]|$)/;

function isWindowsPath(p: string): boolean {
  return WIN_ROOT_RE.test(p);
}

/** Index of the last separator; "\\" only counts as one in Windows paths. */
function lastSep(p: string): number {
  return isWindowsPath(p) ? Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) : p.lastIndexOf("/");
}

/** Splits an absolute path into its root ("/", "C:\", "\\server\share\") and the rest. */
function splitRoot(p: string): { root: string; rest: string } | null {
  const win = WIN_ROOT_RE.exec(p);
  if (win) return { root: win[0].replace(/\//g, "\\") + "\\", rest: p.slice(win[0].length) };
  if (p.startsWith("/")) return { root: "/", rest: p.slice(1) };
  return null;
}

export function dirname(p: string): string {
  const i = lastSep(p);
  if (i < 0) return p;
  const dir = p.slice(0, i);
  // Keep the root's trailing separator: "/a.md" -> "/", "C:\a.md" -> "C:\".
  if (dir === "" || /^[A-Za-z]:$/.test(dir)) return p.slice(0, i + 1);
  return dir;
}

export function basename(p: string): string {
  return p.slice(lastSep(p) + 1);
}

/** Joins a directory and a file name with the directory's separator. */
export function joinPath(dir: string, name: string): string {
  const sep = isWindowsPath(dir) ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? dir + name : dir + sep + name;
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function isMarkdownPath(p: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(p);
}

/**
 * Resolves `rel` (a link or image path from Markdown: "/"-separated, possibly %-encoded,
 * possibly a file:// URL) against the absolute directory `base`.
 */
export function resolvePath(base: string, rel: string): string {
  let target = rel;
  try {
    target = decodeURIComponent(rel);
  } catch {
    /* keep as-is */
  }
  if (target.startsWith("file://")) target = target.slice(7).replace(/^\/(?=[A-Za-z]:)/, "");

  const windows = isWindowsPath(base) || isWindowsPath(target);
  const sepRe = windows ? /[\\/]/ : /\//;
  const baseRoot = splitRoot(base) ?? { root: "/", rest: base };

  let root: string;
  let parts: string[];
  const abs = splitRoot(target);
  if (abs && !(windows && abs.root === "/")) {
    ({ root } = abs);
    parts = [];
    target = abs.rest;
  } else if (windows && /^[\\/]/.test(target)) {
    // "/img.png" on Windows: relative to the current drive's root
    root = baseRoot.root;
    parts = [];
  } else {
    root = baseRoot.root;
    parts = baseRoot.rest.split(sepRe).filter(Boolean);
  }

  for (const seg of target.split(sepRe)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return root + parts.join(windows ? "\\" : "/");
}

/** file:// URL for an absolute path. */
export function fileUrl(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  return "file://" + (slashed.startsWith("/") ? "" : "/") + encodeURI(slashed);
}

/** True for hrefs that point outside the local filesystem (http:, mailto:, data:, ...). */
export function hasUrlScheme(href: string): boolean {
  // Schemes are 2+ chars, so Windows drive paths ("C:\...", "C:/...") don't count.
  return /^[a-z][a-z0-9+.-]+:/i.test(href) && !href.startsWith("file:");
}

export const listFonts = (mono: boolean) => invoke<string[]>("list_fonts", { mono });

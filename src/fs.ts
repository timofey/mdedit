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

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

export function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function isMarkdownPath(p: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(p);
}

/** Resolves `rel` (a URL-ish relative path, possibly %-encoded) against directory `base`. */
export function resolvePath(base: string, rel: string): string {
  let decoded = rel;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    /* keep as-is */
  }
  if (decoded.startsWith("file://")) decoded = decoded.slice(7);
  const parts = decoded.startsWith("/") ? [] : base.split("/");
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.filter(Boolean).join("/");
}

/** True for hrefs that point outside the local filesystem (http:, mailto:, data:, ...). */
export function hasUrlScheme(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("file:");
}

export const listFonts = (mono: boolean) => invoke<string[]>("list_fonts", { mono });

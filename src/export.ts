import { convertFileSrc } from "@tauri-apps/api/core";
import { renderMarkdown } from "./render";
import { renderMermaid } from "./mermaid";
import { hasUrlScheme, resolvePath, writeFile } from "./fs";
import { previewCss, katexExportCss } from "./styles";

const pageCss = `
body { margin: 0; background: var(--bgColor-default, #fff); }
.markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }
@media (max-width: 767px) { .markdown-body { padding: 15px; } }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; }
  /* diagrams are exported with the light mermaid theme */
  .markdown-body .mermaid-block svg { background: #fff; border-radius: 6px; padding: 12px; }
}
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Builds a standalone HTML document: styles inlined, diagrams as SVG, local images embedded. */
export async function buildStandaloneHtml(markdown: string, baseDir: string, fallbackTitle: string): Promise<string> {
  const root = document.createElement("article");
  root.className = "markdown-body";
  root.innerHTML = renderMarkdown(markdown);

  root.querySelectorAll(".copy-btn").forEach((b) => b.remove());
  root.querySelectorAll("[data-line]").forEach((el) => el.removeAttribute("data-line"));

  for (const block of root.querySelectorAll(".mermaid-block")) {
    const src = block.querySelector(".mermaid-src")?.textContent ?? "";
    try {
      block.innerHTML = await renderMermaid(src, "default");
    } catch {
      /* leave the source visible */
    }
  }

  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src || hasUrlScheme(src)) continue;
    const path = resolvePath(baseDir, src);
    const data = await toDataUrl(convertFileSrc(path));
    img.setAttribute("src", data ?? "file://" + encodeURI(path));
  }

  const title = root.querySelector("h1")?.textContent?.trim() || fallbackTitle;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
${katexExportCss}
${previewCss}
${pageCss}
</style>
</head>
<body>
${root.outerHTML}
</body>
</html>
`;
}

export async function exportHtml(markdown: string, mdPath: string, baseDir: string, title: string): Promise<string> {
  const outPath = mdPath.replace(/\.[^./]+$/, "") + ".html";
  const html = await buildStandaloneHtml(markdown, baseDir, title);
  await writeFile(outPath, html);
  return outPath;
}

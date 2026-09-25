import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import deflist from "markdown-it-deflist";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import mark from "markdown-it-mark";
import { full as emoji } from "markdown-it-emoji";
import anchor from "markdown-it-anchor";
import frontMatter from "markdown-it-front-matter";
import alerts from "markdown-it-github-alerts";
import katexPlugin from "@vscode/markdown-it-katex";

/** GitHub-style heading slugs, so `[x](#some-heading)` links behave like on GitHub. */
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through to plain text */
    }
  }
  return escapeHtml(code);
}

/** Some plugins are CommonJS; depending on the bundler their default import is the module object. */
const plugin = (m: any) => m?.default ?? m;

function createMd() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, breaks: false });

  let frontMatterText = "";
  md.use(plugin(frontMatter), (fm: string) => {
    frontMatterText = fm;
  });
  md.use(plugin(taskLists), { enabled: false, label: true })
    .use(plugin(footnote))
    .use(plugin(deflist))
    .use(plugin(sub))
    .use(plugin(sup))
    .use(plugin(mark))
    .use(plugin(emoji))
    .use(plugin(alerts))
    .use(plugin(katexPlugin), { enableFencedBlocks: true, throwOnError: false })
    .use(plugin(anchor), { slugify, tabIndex: false });

  // Front matter: shown as a muted YAML block instead of disappearing silently.
  md.renderer.rules.front_matter = (tokens, idx) =>
    `<pre class="front-matter" data-line="${tokens[idx].map?.[0] ?? 0}"><code class="hljs language-yaml">${highlight(
      frontMatterText,
      "yaml",
    )}</code></pre>\n`;

  // Fenced code: highlight.js, language label, copy button; mermaid diagrams handled by the preview.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";
    const lang = info.split(/\s+/)[0] ?? "";
    const line = token.map ? ` data-line="${token.map[0]}"` : "";
    const code = token.content;

    if (lang.toLowerCase() === "mermaid") {
      return `<div class="mermaid-block"${line}><pre class="mermaid-src">${escapeHtml(code)}</pre></div>\n`;
    }
    const langClass = lang ? ` language-${escapeHtml(lang)}` : "";
    const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
    return (
      `<div class="code-block"${line}>${label}<button class="copy-btn" type="button">Copy</button>` +
      `<pre><code class="hljs${langClass}">${highlight(code, lang)}</code></pre></div>\n`
    );
  };

  // Indented code blocks get the same container (no highlighting, like GitHub).
  md.renderer.rules.code_block = (tokens, idx) => {
    const token = tokens[idx];
    const line = token.map ? ` data-line="${token.map[0]}"` : "";
    return `<div class="code-block"${line}><button class="copy-btn" type="button">Copy</button><pre><code class="hljs">${escapeHtml(
      token.content,
    )}</code></pre></div>\n`;
  };

  // Source line anchors on block elements, used for editor <-> preview scroll sync.
  md.core.ruler.push("source_lines", (state) => {
    for (const t of state.tokens as Token[]) {
      if (t.map && t.block && t.nesting >= 0 && t.type !== "fence" && t.type !== "code_block") {
        t.attrSet("data-line", String(t.map[0]));
      }
    }
  });

  return md;
}

const md = createMd();

let purify: ReturnType<typeof DOMPurify> | null = null;

/** Markdown -> sanitized HTML. Relative URLs are left untouched; the preview resolves them. */
export function renderMarkdown(src: string): string {
  purify ??= DOMPurify(window);
  // Scripts/handlers are stripped; task-list checkboxes and link targets survive.
  return purify.sanitize(md.render(src), {
    ADD_ATTR: ["target", "checked", "disabled"],
    ADD_TAGS: ["input"],
  }) as string;
}

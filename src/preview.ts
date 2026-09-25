import { convertFileSrc } from "@tauri-apps/api/core";
import { hasUrlScheme, resolvePath } from "./fs";
import { renderMermaid } from "./mermaid";

interface Block {
  el: ChildNode;
  key: string;
}

const LINE_ATTR_RE = / data-line="\d+"/g;

export interface PreviewHandlers {
  /** A link to something other than an in-page anchor was clicked. */
  onLink: (href: string) => void;
  /** Layout changed (images loaded, diagrams rendered) — scroll sync must re-measure. */
  onLayoutChange: () => void;
}

/**
 * Renders HTML into the preview. Top-level blocks are diffed against the previous render
 * (ignoring source-line attributes), so typing only touches the changed blocks: images
 * don't reload and mermaid diagrams don't re-render.
 */
export class Preview {
  private blocks: Block[] = [];
  private baseDir: string | null = null;

  constructor(
    readonly scroller: HTMLElement,
    readonly content: HTMLElement,
    private handlers: PreviewHandlers,
  ) {
    content.addEventListener("click", (e) => this.onClick(e));
  }

  /** Drops all rendered blocks (e.g. when switching to a different file). */
  reset(baseDir: string | null): void {
    this.baseDir = baseDir;
    this.blocks = [];
    this.content.replaceChildren();
  }

  update(html: string): void {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const next: Block[] = [...tpl.content.childNodes]
      .filter((n) => n instanceof Element || (n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""))
      .map((el) => ({
        el,
        key: el instanceof Element ? el.outerHTML.replace(LINE_ATTR_RE, "") : el.textContent!,
      }));
    const prev = this.blocks;

    let start = 0;
    while (start < prev.length && start < next.length && prev[start].key === next[start].key) start++;
    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1].key === next[endNext - 1].key) {
      endPrev--;
      endNext--;
    }

    // Unchanged blocks: keep the live element, refresh its source-line anchors.
    for (let i = 0; i < start; i++) copyLineAttrs(next[i].el, prev[i].el);
    for (let i = 0; i < prev.length - endPrev; i++) {
      copyLineAttrs(next[endNext + i].el, prev[endPrev + i].el);
    }

    for (let i = start; i < endPrev; i++) prev[i].el.remove();
    const anchor = endPrev < prev.length ? prev[endPrev].el : null;
    const inserted = next.slice(start, endNext);
    for (const b of inserted) {
      this.content.insertBefore(b.el, anchor);
      if (b.el instanceof Element) this.postProcess(b.el);
    }

    this.blocks = [...prev.slice(0, start), ...inserted, ...prev.slice(endPrev)];
    this.handlers.onLayoutChange();
  }

  private postProcess(root: Element): void {
    const imgs = root.matches("img") ? [root as HTMLImageElement] : [...root.querySelectorAll("img")];
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (src && this.baseDir && !hasUrlScheme(src) && !src.startsWith("#")) {
        img.src = convertFileSrc(resolvePath(this.baseDir, src));
      }
      if (!img.complete) img.addEventListener("load", () => this.handlers.onLayoutChange(), { once: true });
    }

    const mermaids = root.matches(".mermaid-block") ? [root] : [...root.querySelectorAll(".mermaid-block")];
    for (const block of mermaids) {
      const src = block.querySelector(".mermaid-src")?.textContent ?? "";
      renderMermaid(src)
        .then((svg) => {
          block.innerHTML = svg;
          this.handlers.onLayoutChange();
        })
        .catch((err) => {
          const msg = document.createElement("div");
          msg.className = "mermaid-error";
          msg.textContent = `Mermaid: ${err instanceof Error ? err.message : String(err)}`;
          block.append(msg);
        });
    }
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as Element;

    const copy = target.closest(".copy-btn");
    if (copy) {
      const code = copy.parentElement?.querySelector("code")?.textContent ?? "";
      copyText(code).then(() => {
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy"), 1200);
      });
      return;
    }

    const a = target.closest("a");
    if (!a) return;
    // Never let the webview itself navigate away from the app.
    e.preventDefault();
    const href = a.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#")) {
      this.scrollToAnchor(href.slice(1));
    } else {
      this.handlers.onLink(href);
    }
  }

  scrollToAnchor(id: string): void {
    let decoded = id;
    try {
      decoded = decodeURIComponent(id);
    } catch {
      /* keep */
    }
    const el = this.content.querySelector(`[id="${CSS.escape(decoded)}"]`) ?? this.content.querySelector(`[name="${CSS.escape(decoded)}"]`);
    el?.scrollIntoView({ block: "start" });
  }
}

function copyLineAttrs(from: ChildNode, to: ChildNode): void {
  if (!(from instanceof Element) || !(to instanceof Element)) return;
  const src = from.getAttribute("data-line");
  if (src !== null) to.setAttribute("data-line", src);
  const a = from.querySelectorAll("[data-line]");
  const b = to.querySelectorAll("[data-line]");
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) b[i].setAttribute("data-line", a[i].getAttribute("data-line")!);
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

import type { EditorView } from "@codemirror/view";

interface Anchor {
  line: number; // 0-based source line
  top: number; // offset inside the preview's scroll content
}

/**
 * Keeps editor and preview scroll positions aligned using the `data-line` source anchors
 * emitted by the renderer, interpolating between neighbouring anchors. Whichever pane the
 * user last interacted with drives the other one.
 */
export class ScrollSync {
  private anchors: Anchor[] | null = null;
  private driver: "editor" | "preview" = "editor";
  private frame = 0;

  constructor(
    private view: EditorView,
    private scroller: HTMLElement,
    private content: HTMLElement,
    private enabled: () => boolean,
  ) {
    const editorScroller = view.scrollDOM;
    for (const ev of ["wheel", "pointerdown", "keydown", "touchstart"]) {
      editorScroller.addEventListener(ev, () => (this.driver = "editor"), { passive: true, capture: true });
      scroller.addEventListener(ev, () => (this.driver = "preview"), { passive: true, capture: true });
    }
    editorScroller.addEventListener("scroll", () => this.driver === "editor" && this.schedule("editor"));
    scroller.addEventListener("scroll", () => this.driver === "preview" && this.schedule("preview"));
    new ResizeObserver(() => this.invalidate()).observe(content);
  }

  invalidate(): void {
    this.anchors = null;
  }

  /** Aligns the preview to the editor (used after re-rendering while typing). */
  syncFromEditor(): void {
    this.driver = "editor";
    this.schedule("editor");
  }

  private schedule(from: "editor" | "preview"): void {
    if (!this.enabled()) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => (from === "editor" ? this.editorToPreview() : this.previewToEditor()));
  }

  private getAnchors(): Anchor[] {
    if (this.anchors) return this.anchors;
    const base = this.content.getBoundingClientRect().top;
    const raw: Anchor[] = [];
    for (const el of this.content.querySelectorAll<HTMLElement>("[data-line]")) {
      if (el.offsetParent === null) continue; // hidden (e.g. inside closed <details>)
      raw.push({ line: Number(el.dataset.line), top: el.getBoundingClientRect().top - base });
    }
    raw.sort((a, b) => a.line - b.line || a.top - b.top);
    // Keep anchors monotonic in both line and position.
    const out: Anchor[] = [{ line: 0, top: 0 }];
    for (const a of raw) {
      const last = out[out.length - 1];
      if (a.line > last.line && a.top >= last.top) out.push(a);
    }
    out.push({ line: this.view.state.doc.lines, top: this.content.scrollHeight });
    this.anchors = out;
    return out;
  }

  /** Fractional 0-based source line at the top of the editor viewport. */
  private editorTopLine(): number {
    const v = this.view;
    const height = v.scrollDOM.getBoundingClientRect().top - v.documentTop;
    const block = v.lineBlockAtHeight(Math.max(0, height));
    const line = v.state.doc.lineAt(block.from).number - 1;
    const frac = block.height > 0 ? Math.min(1, Math.max(0, (height - block.top) / block.height)) : 0;
    return line + frac;
  }

  private editorToPreview(): void {
    const ed = this.view.scrollDOM;
    const maxEd = ed.scrollHeight - ed.clientHeight;
    const maxPv = this.scroller.scrollHeight - this.scroller.clientHeight;
    if (ed.scrollTop <= 0) return void (this.scroller.scrollTop = 0);
    if (ed.scrollTop >= maxEd - 1) return void (this.scroller.scrollTop = maxPv);

    const pos = this.editorTopLine();
    const anchors = this.getAnchors();
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1].line <= pos) i++;
    const a = anchors[i];
    const b = anchors[i + 1];
    const t = b.line > a.line ? (pos - a.line) / (b.line - a.line) : 0;
    const contentOffset = this.content.offsetTop;
    this.scroller.scrollTop = contentOffset + a.top + t * (b.top - a.top);
  }

  private previewToEditor(): void {
    const pv = this.scroller;
    const ed = this.view.scrollDOM;
    if (pv.scrollTop <= 0) return void (ed.scrollTop = 0);
    if (pv.scrollTop >= pv.scrollHeight - pv.clientHeight - 1) return void (ed.scrollTop = ed.scrollHeight);

    const y = pv.scrollTop - this.content.offsetTop;
    const anchors = this.getAnchors();
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1].top <= y) i++;
    const a = anchors[i];
    const b = anchors[i + 1];
    const t = b.top > a.top ? (y - a.top) / (b.top - a.top) : 0;
    const pos = a.line + t * (b.line - a.line);

    const v = this.view;
    const doc = v.state.doc;
    const lineNo = Math.min(doc.lines, Math.floor(pos) + 1);
    const block = v.lineBlockAt(doc.line(lineNo).from);
    const frac = pos - Math.floor(pos);
    const docOffset = v.documentTop - ed.getBoundingClientRect().top + ed.scrollTop;
    ed.scrollTop = docOffset + block.top + frac * block.height;
  }
}

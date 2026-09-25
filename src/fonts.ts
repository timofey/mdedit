import { listFonts } from "./fs";

export const DEFAULT_EDITOR_STACK =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "DejaVu Sans Mono", ui-monospace, monospace';
export const DEFAULT_PREVIEW_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

interface FontSettings {
  editorFont: string; // "" = default stack
  editorSize: number;
  previewFont: string;
  previewSize: number;
}

const DEFAULTS: FontSettings = { editorFont: "", editorSize: 14, previewFont: "", previewSize: 16 };
const KEY = "mdedit.fonts";
const MIN_SIZE = 8;
const MAX_SIZE = 32;

function load(): FontSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function stack(font: string, fallback: string): string {
  return font ? `"${font.replace(/"/g, "")}", ${fallback}` : fallback;
}

/** Typeface and size settings for the editor and preview, exposed as CSS variables. */
export class FontSettingsPanel {
  private s = load();
  private loaded = false;

  constructor(
    private button: HTMLElement,
    private panel: HTMLElement,
    private onChange: () => void,
  ) {
    this.apply();

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    document.addEventListener("mousedown", (e) => {
      if (!panel.hidden && !panel.contains(e.target as Node) && e.target !== button) this.toggle(false);
    });
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.toggle(false);
    });

    panel.querySelectorAll<HTMLButtonElement>("button[data-size]").forEach((b) =>
      b.addEventListener("click", () => {
        const [which, delta] = b.dataset.size!.split(":");
        if (which === "editor") this.s.editorSize = clampSize(this.s.editorSize + Number(delta));
        else this.s.previewSize = clampSize(this.s.previewSize + Number(delta));
        this.save();
      }),
    );
    this.select("editor").addEventListener("change", (e) => {
      this.s.editorFont = (e.target as HTMLSelectElement).value;
      this.save();
    });
    this.select("preview").addEventListener("change", (e) => {
      this.s.previewFont = (e.target as HTMLSelectElement).value;
      this.save();
    });
    panel.querySelector("#fonts-reset")!.addEventListener("click", () => {
      this.s = { ...DEFAULTS };
      this.syncControls();
      this.save();
    });
  }

  private select(which: "editor" | "preview"): HTMLSelectElement {
    return this.panel.querySelector(`#${which}-font`)!;
  }

  private async toggle(show = this.panel.hidden !== false): Promise<void> {
    this.panel.hidden = !show;
    this.button.classList.toggle("active", show);
    if (show && !this.loaded) {
      this.loaded = true;
      const [mono, all] = await Promise.all([listFonts(true), listFonts(false)]).catch(() => [[], []]);
      fillSelect(this.select("editor"), mono, this.s.editorFont);
      fillSelect(this.select("preview"), all, this.s.previewFont);
    }
    this.syncControls();
  }

  private syncControls(): void {
    this.select("editor").value = this.s.editorFont;
    this.select("preview").value = this.s.previewFont;
    this.panel.querySelector("#editor-size")!.textContent = `${this.s.editorSize}px`;
    this.panel.querySelector("#preview-size")!.textContent = `${this.s.previewSize}px`;
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* ignore */
    }
    this.syncControls();
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement.style;
    root.setProperty("--editor-font", stack(this.s.editorFont, DEFAULT_EDITOR_STACK));
    root.setProperty("--editor-size", `${this.s.editorSize}px`);
    root.setProperty("--preview-font", stack(this.s.previewFont, DEFAULT_PREVIEW_STACK));
    root.setProperty("--preview-size", `${this.s.previewSize}px`);
    this.onChange();
  }
}

function clampSize(n: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

function fillSelect(sel: HTMLSelectElement, fonts: string[], current: string): void {
  const opts = [new Option("Default", "")];
  // Keep a saved font selectable even if it's no longer installed.
  const list = current && !fonts.includes(current) ? [current, ...fonts] : fonts;
  for (const f of list) {
    const o = new Option(f, f);
    o.style.fontFamily = `"${f}"`;
    opts.push(o);
  }
  sel.replaceChildren(...opts);
  sel.value = current;
}

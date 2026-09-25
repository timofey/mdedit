export type ViewMode = "source" | "split" | "preview";

const MODE_KEY = "mdedit.viewMode";
const SPLIT_KEY = "mdedit.split";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export class ViewModes {
  mode: ViewMode;

  constructor(
    private panes: HTMLElement,
    private switcher: HTMLElement,
    splitter: HTMLElement,
    private onChange: (mode: ViewMode) => void,
  ) {
    const saved = load(MODE_KEY);
    this.mode = saved === "source" || saved === "preview" ? saved : "split";
    const ratio = Number(load(SPLIT_KEY));
    if (ratio > 0.1 && ratio < 0.9) this.setRatio(ratio);

    switcher.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach((b) =>
      b.addEventListener("click", () => this.set(b.dataset.mode as ViewMode)),
    );

    splitter.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      splitter.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const r = this.panes.getBoundingClientRect();
        this.setRatio(Math.min(0.85, Math.max(0.15, (ev.clientX - r.left) / r.width)));
      };
      const up = () => {
        splitter.removeEventListener("pointermove", move);
        splitter.removeEventListener("pointerup", up);
        store(SPLIT_KEY, this.panes.style.getPropertyValue("--split"));
        this.onChange(this.mode);
      };
      splitter.addEventListener("pointermove", move);
      splitter.addEventListener("pointerup", up);
    });

    this.apply();
  }

  set(mode: ViewMode): void {
    this.mode = mode;
    store(MODE_KEY, mode);
    this.apply();
    this.onChange(mode);
  }

  get showsPreview(): boolean {
    return this.mode !== "source";
  }

  private setRatio(r: number): void {
    this.panes.style.setProperty("--split", String(r));
  }

  private apply(): void {
    this.panes.dataset.mode = this.mode;
    this.switcher.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === this.mode);
    });
  }
}

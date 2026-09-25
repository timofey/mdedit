type Mermaid = typeof import("mermaid").default;

let mermaidPromise: Promise<Mermaid> | null = null;
const cache = new Map<string, string>();
const CACHE_LIMIT = 200;
let counter = 0;

export type MermaidTheme = "default" | "dark";

const CONCRETE_FONTS: Record<string, string> = {
  "sans-serif": '"DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif',
  serif: '"DejaVu Serif", "Noto Serif", "Liberation Serif", "Times New Roman", serif',
  monospace: '"DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", monospace',
};

/**
 * WebKitGTK returns an empty getBBox() for SVG text whose inline font-family is only a
 * generic family (e.g. "sans-serif"). Mermaid measures text exactly that way (sequence
 * diagrams fail with "svg element not in render tree"), so retry such measurements
 * with a concrete font stack.
 */
function patchGetBBoxForGenericFonts(): void {
  const proto = SVGGraphicsElement.prototype;
  const original = proto.getBBox;
  proto.getBBox = function (this: SVGGraphicsElement, options?: SVGBoundingBoxOptions): DOMRect {
    const box = original.call(this, options);
    const family = this.style.fontFamily.trim().toLowerCase();
    if (box.width || box.height || !(family in CONCRETE_FONTS)) return box;
    const inline = this.style.fontFamily;
    this.style.fontFamily = CONCRETE_FONTS[family];
    try {
      return original.call(this, options);
    } finally {
      this.style.fontFamily = inline;
    }
  };
}

export function currentMermaidTheme(): MermaidTheme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
}

/** Renders mermaid source to an SVG string. Mermaid itself is loaded lazily, on first use. */
export async function renderMermaid(src: string, theme: MermaidTheme = currentMermaidTheme()): Promise<string> {
  const key = theme + "\0" + src;
  const hit = cache.get(key);
  if (hit) return hit;

  mermaidPromise ??= import("mermaid").then((m) => {
    patchGetBBoxForGenericFonts();
    return m.default;
  });
  const mermaid = await mermaidPromise;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });
  const id = `mermaid-svg-${++counter}`;
  try {
    const { svg } = await mermaid.render(id, src);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, svg);
    return svg;
  } finally {
    // mermaid leaves its temporary render container behind on errors
    document.getElementById("d" + id)?.remove();
  }
}

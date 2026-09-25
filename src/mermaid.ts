type Mermaid = typeof import("mermaid").default;

let mermaidPromise: Promise<Mermaid> | null = null;
const cache = new Map<string, string>();
const CACHE_LIMIT = 200;
let counter = 0;

export type MermaidTheme = "default" | "dark";

export function currentMermaidTheme(): MermaidTheme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
}

/** Renders mermaid source to an SVG string. Mermaid itself is loaded lazily, on first use. */
export async function renderMermaid(src: string, theme: MermaidTheme = currentMermaidTheme()): Promise<string> {
  const key = theme + "\0" + src;
  const hit = cache.get(key);
  if (hit) return hit;

  mermaidPromise ??= import("mermaid").then((m) => m.default);
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

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../render";

const src = readFileSync(resolve(__dirname, "fixtures/all-features.md"), "utf8");
const html = renderMarkdown(src);
const doc = new DOMParser().parseFromString(html, "text/html");
const $ = (sel: string) => doc.querySelectorAll(sel);

describe("renderMarkdown", () => {
  it("renders headings with GitHub-style ids", () => {
    expect(doc.querySelector("h1")?.id).toBe("heading-1");
    expect(doc.querySelector("h2")?.id).toBe("heading-2-with-code");
    expect(doc.querySelector("h2 code")?.textContent).toBe("code");
  });

  it("renders inline formatting", () => {
    expect($("strong").length).toBeGreaterThan(0);
    expect($("s").length).toBe(1);
    expect($("mark").length).toBe(1);
    expect(doc.querySelector("sub")?.textContent).toBe("2");
    expect(doc.querySelector("sup")?.textContent).toBe("2");
    expect(html).toContain("😄");
    expect(doc.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect($("br").length).toBeGreaterThan(0);
  });

  it("renders front matter as a yaml block", () => {
    expect(doc.querySelector("pre.front-matter")?.textContent).toContain("title: Feature test");
  });

  it("renders tables with alignment", () => {
    const ths = $("table th");
    expect(ths.length).toBe(3);
    expect(ths[1].getAttribute("style")).toContain("center");
    expect(ths[2].getAttribute("style")).toContain("right");
    expect(doc.querySelector("table td code")?.textContent).toBe("b|c");
  });

  it("highlights fenced code by language", () => {
    const rust = doc.querySelector("code.language-rust")!;
    expect(rust.querySelector(".hljs-keyword")).not.toBeNull();
    expect(rust.textContent).toContain('println!("Hello <world> & {}", 42);');
    expect(doc.querySelector("code.language-typescript .hljs-keyword")).not.toBeNull();
    expect(doc.querySelector("blockquote code.language-python .hljs-keyword")).not.toBeNull();
    expect(doc.querySelector("li code.language-js")?.textContent).toContain('const nested = () => "in list";');
  });

  it("keeps plain and indented code untouched", () => {
    const blocks = [...$(".code-block code")].map((c) => c.textContent);
    expect(blocks).toContain("no language here <tag>\n");
    expect(blocks).toContain("indented code block\n");
  });

  it("renders task lists, nested lists, deflists", () => {
    const boxes = $('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect(doc.querySelector("ol ul ol")).not.toBeNull();
    expect(doc.querySelector("dl dt")?.textContent).toBe("Term");
  });

  it("renders alerts, footnotes, math, mermaid placeholder", () => {
    expect(doc.querySelector(".markdown-alert-note")).not.toBeNull();
    expect(doc.querySelector(".markdown-alert-warning")).not.toBeNull();
    expect(doc.querySelector(".footnotes")).not.toBeNull();
    expect($(".katex").length).toBeGreaterThanOrEqual(2);
    expect(doc.querySelector(".katex-display")).not.toBeNull();
    expect(doc.querySelector(".mermaid-block .mermaid-src")?.textContent).toContain("A-->B");
  });

  it("keeps safe HTML and strips scripts", () => {
    expect(doc.querySelector("details summary")?.textContent).toBe("Click");
    expect(doc.querySelector("details em")?.textContent).toBe("markdown");
    expect($("kbd").length).toBe(2);
    expect($("script").length).toBe(0);
    expect(html).not.toContain("onerror");
    expect(html).toContain("*not italic*");
    expect(html).toContain("4 &lt; 5 &amp; 6 &gt; 3");
  });

  it("annotates blocks with source lines", () => {
    expect(doc.querySelector("h1")?.getAttribute("data-line")).toBe("5");
    expect(doc.querySelector("table")?.getAttribute("data-line")).not.toBeNull();
    expect(doc.querySelector(".code-block")?.getAttribute("data-line")).not.toBeNull();
  });
});

import katex from "katex";
import githubCss from "github-markdown-css/github-markdown.css?raw";
import hljsLight from "highlight.js/styles/github.css?raw";
import hljsDark from "highlight.js/styles/github-dark.css?raw";
import katexCss from "katex/dist/katex.min.css?raw";
import previewExtra from "./styles/preview.css?raw";

/** Markdown body + code highlighting CSS, following the system light/dark preference. */
export const previewCss = `${githubCss}\n${hljsLight}\n@media (prefers-color-scheme: dark) {\n${hljsDark}\n}\n${previewExtra}`;

/** KaTeX CSS for exported files, with fonts loaded from the CDN. */
export const katexExportCss = katexCss.replace(
  /url\(fonts\//g,
  `url(https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/fonts/`,
);

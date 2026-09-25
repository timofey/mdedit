import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";

// Colors come from CSS variables so the editor follows the light/dark theme.
const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700", fontSize: "1.3em", color: "var(--hl-heading)" },
  { tag: t.heading2, fontWeight: "700", fontSize: "1.18em", color: "var(--hl-heading)" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "700", color: "var(--hl-heading)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--hl-link)" },
  { tag: t.monospace, color: "var(--hl-code)" },
  { tag: [t.processingInstruction, t.contentSeparator, t.quote], color: "var(--hl-meta)" },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: "var(--hl-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--hl-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--hl-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--hl-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--hl-function)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--hl-type)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--hl-property)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--hl-tag)" },
  { tag: t.meta, color: "var(--hl-meta)" },
  { tag: t.invalid, color: "var(--hl-invalid)" },
]);

// Editor chrome; colors come from the CSS variables in app.css.
const theme = EditorView.theme({
  "&": { height: "100%", flex: "1", backgroundColor: "var(--bg)", color: "var(--fg)", fontSize: "calc(var(--editor-size, 14px) * var(--zoom))" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--editor-font, monospace)",
    lineHeight: "1.55",
  },
  ".cm-content": { padding: "16px 0 40vh", caretColor: "var(--fg)" },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--fg-muted)", borderRight: "1px solid var(--border)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--editor-active-line)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--selection)" },
  ".cm-selectionMatch": { backgroundColor: "rgba(255, 213, 0, 0.22)" },
  ".cm-searchMatch": { backgroundColor: "rgba(255, 213, 0, 0.35)", outline: "none" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(255, 140, 0, 0.55)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "rgba(46, 160, 67, 0.3)", outline: "none" },
  ".cm-panels": { backgroundColor: "var(--bg-chrome)", color: "var(--fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-textfield": { backgroundColor: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "4px" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "4px" },
});

export interface EditorCallbacks {
  onDocChanged: () => void;
}

export function createEditorState(doc: string, cb: EditorCallbacks): EditorState {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    theme,
    syntaxHighlighting(highlightStyle),
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.onDocChanged();
    }),
  ];
  return EditorState.create({ doc, extensions });
}

export function createEditorView(parent: HTMLElement, state: EditorState): EditorView {
  return new EditorView({ state, parent });
}

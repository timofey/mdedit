import { Text, type EditorState } from "@codemirror/state";
import { basename } from "./fs";

export interface Tab {
  id: number;
  path: string | null;
  untitledName: string;
  state: EditorState;
  saved: Text;
  eol: string;
  editorScroll: number;
  previewScroll: number;
  diskChanged: boolean;
}

export function tabName(t: Tab): string {
  return t.path ? basename(t.path) : t.untitledName;
}

export function isDirty(t: Tab): boolean {
  return !t.state.doc.eq(t.saved);
}

export function textOf(s: string): Text {
  return Text.of(s.split(/\r\n?|\n/));
}

export interface TabBarHandlers {
  onActivate: (t: Tab) => void;
  onClose: (t: Tab) => void;
}

export function renderTabBar(el: HTMLElement, tabs: Tab[], active: Tab | null, h: TabBarHandlers): void {
  el.replaceChildren(
    ...tabs.map((t) => {
      const item = document.createElement("div");
      item.className = "tab" + (t === active ? " active" : "") + (isDirty(t) ? " dirty" : "");
      item.title = t.path ?? t.untitledName;

      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tabName(t);

      const close = document.createElement("button");
      close.className = "tab-close";
      close.type = "button";
      close.title = "Close (Ctrl+W)";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        h.onClose(t);
      });

      item.append(label, close);
      item.addEventListener("mousedown", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          h.onClose(t);
        }
      });
      item.addEventListener("click", () => h.onActivate(t));
      return item;
    }),
  );
  el.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

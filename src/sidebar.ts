import { basename, listMdFiles, type MdFile } from "./fs";

export class Sidebar {
  private dir: string | null = null;
  private files: MdFile[] = [];
  private activePath: string | null = null;

  constructor(
    private header: HTMLElement,
    private list: HTMLElement,
    private onOpen: (path: string) => void,
  ) {}

  get folder(): string | null {
    return this.dir;
  }

  /** Shows the folder of `activePath`; reloads the listing only when the folder changed or `force`. */
  async show(dir: string | null, activePath: string | null, force = false): Promise<void> {
    this.activePath = activePath;
    if (dir && (dir !== this.dir || force)) {
      try {
        this.files = await listMdFiles(dir);
      } catch {
        this.files = [];
      }
      this.dir = dir;
    }
    this.render();
  }

  private render(): void {
    this.header.textContent = this.dir ? basename(this.dir) || this.dir : "No folder";
    this.header.title = this.dir ?? "";
    if (this.dir && this.files.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "No Markdown files";
      this.list.replaceChildren(empty);
      return;
    }
    this.list.replaceChildren(
      ...this.files.map((f) => {
        const item = document.createElement("div");
        item.className = "sidebar-item" + (f.path === this.activePath ? " active" : "");
        item.textContent = f.name;
        item.title = f.path;
        item.addEventListener("click", () => this.onOpen(f.path));
        return item;
      }),
    );
  }
}

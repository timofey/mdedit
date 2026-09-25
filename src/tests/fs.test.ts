import { describe, expect, it } from "vitest";
import { basename, dirname, fileUrl, hasUrlScheme, joinPath, resolvePath } from "../fs";

describe("POSIX paths", () => {
  it("dirname / basename", () => {
    expect(dirname("/home/me/notes/a.md")).toBe("/home/me/notes");
    expect(dirname("/a.md")).toBe("/");
    expect(basename("/home/me/notes/a.md")).toBe("a.md");
    expect(basename("/home/me/odd\\name.md")).toBe("odd\\name.md");
    expect(dirname("/home/me/odd\\name.md")).toBe("/home/me");
  });

  it("resolvePath", () => {
    expect(resolvePath("/home/me/notes", "images/pic.png")).toBe("/home/me/notes/images/pic.png");
    expect(resolvePath("/home/me/notes", "../other.md")).toBe("/home/me/other.md");
    expect(resolvePath("/home/me/notes", "./a%20b.md")).toBe("/home/me/notes/a b.md");
    expect(resolvePath("/home/me/notes", "/etc/x.png")).toBe("/etc/x.png");
    expect(resolvePath("/home/me/notes", "file:///tmp/x.png")).toBe("/tmp/x.png");
    expect(resolvePath("/", "a.md")).toBe("/a.md");
  });

  it("joinPath / fileUrl", () => {
    expect(joinPath("/home/me", "a.md")).toBe("/home/me/a.md");
    expect(joinPath("/", "a.md")).toBe("/a.md");
    expect(fileUrl("/home/me/a b.png")).toBe("file:///home/me/a%20b.png");
  });
});

describe("Windows paths", () => {
  it("dirname / basename", () => {
    expect(dirname("C:\\Users\\me\\notes\\a.md")).toBe("C:\\Users\\me\\notes");
    expect(dirname("C:\\a.md")).toBe("C:\\");
    expect(basename("C:\\Users\\me\\notes\\a.md")).toBe("a.md");
    expect(basename("C:\\")).toBe("");
    expect(dirname("\\\\server\\share\\docs\\a.md")).toBe("\\\\server\\share\\docs");
  });

  it("resolvePath with Markdown-style relative paths", () => {
    const base = "C:\\Users\\me\\notes";
    expect(resolvePath(base, "images/pic.png")).toBe("C:\\Users\\me\\notes\\images\\pic.png");
    expect(resolvePath(base, "images\\pic.png")).toBe("C:\\Users\\me\\notes\\images\\pic.png");
    expect(resolvePath(base, "../other.md")).toBe("C:\\Users\\me\\other.md");
    expect(resolvePath(base, "../../../../x.md")).toBe("C:\\x.md");
    expect(resolvePath(base, "/img.png")).toBe("C:\\img.png");
    expect(resolvePath(base, "D:/pics/x.png")).toBe("D:\\pics\\x.png");
    expect(resolvePath(base, "file:///D:/pics/x%20y.png")).toBe("D:\\pics\\x y.png");
    expect(resolvePath("C:\\", "a.md")).toBe("C:\\a.md");
    expect(resolvePath("\\\\server\\share\\docs", "../a.md")).toBe("\\\\server\\share\\a.md");
  });

  it("joinPath / fileUrl", () => {
    expect(joinPath("C:\\Users\\me", "a.md")).toBe("C:\\Users\\me\\a.md");
    expect(joinPath("C:\\", "a.md")).toBe("C:\\a.md");
    expect(fileUrl("C:\\Users\\me\\a b.png")).toBe("file:///C:/Users/me/a%20b.png");
  });

  it("drive letters are not URL schemes", () => {
    expect(hasUrlScheme("C:\\x.png")).toBe(false);
    expect(hasUrlScheme("C:/x.png")).toBe(false);
    expect(hasUrlScheme("https://example.com")).toBe(true);
    expect(hasUrlScheme("mailto:a@b.c")).toBe(true);
    expect(hasUrlScheme("file:///x")).toBe(false);
    expect(hasUrlScheme("images/x.png")).toBe(false);
  });
});

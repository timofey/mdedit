---
title: Feature test
tags: [a, b]
---

# Heading 1

## Heading 2 with `code`

### Heading 3

Paragraph with **bold**, *italic*, ***both***, ~~strike~~, `inline code`, ==mark==, H~2~O, x^2^, :smile:,
and an autolink https://example.com plus [a link](https://example.com "title") and [anchor](#heading-3).

Line with trailing backslash\
hard break.

> Blockquote
>
> > nested quote
>
> ```python
> def in_quote():
>     return 1
> ```

> [!NOTE]
> Useful information.

> [!WARNING]
> Careful.

1. First
2. Second
   - nested bullet
     1. deep ordered

        ```js
        const nested = () => "in list";
        ```
3. Third

- [x] done task
- [ ] open task

| Left | Center | Right |
|:-----|:------:|------:|
| a    | `b\|c` | 1     |
| **x**| y      | 22    |

```rust
fn main() {
    println!("Hello <world> & {}", 42);
}
```

```typescript
interface Foo { bar: string }
const x: Foo = { bar: `tpl ${1 + 2}` };
```

```
no language here <tag>
```

    indented code block

```mermaid
graph TD; A-->B;
```

Inline math $E = mc^2$ and block:

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

Term
: Definition

Footnote reference[^1].

[^1]: The footnote.

<details>
<summary>Click</summary>

Hidden *markdown* content.

</details>

<kbd>Ctrl</kbd>+<kbd>S</kbd>

<script>alert("xss")</script>
<img src="x.png" onerror="alert(1)">

Escapes: \*not italic\* and 4 < 5 & 6 > 3.

---

![image](images/pic.png)

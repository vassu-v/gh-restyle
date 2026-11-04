# 0004 — Render markdown source, not GitHub's HTML

**Context.** GitHub can return `body_html`, but React Native can't render HTML. A WebView per comment is
heavy and looks foreign, and stripping tags (M1) lost lists, code and tables.

**Decision.** Fetch markdown source (`body`, raw README and files) and render it with `marked`'s lexer into
native views (`apps/app/src/ui/Markdown.tsx`).

**Consequences.**
- It's consistent on web, iOS and Android, and themed by design tokens.
- Relative links and images resolve against the repo. `@user`, `#123` and github.com links open in-app.
- Some GitHub extras aren't rendered yet:
  - syntax highlighting
  - emoji shortcodes
  - math and mermaid
  - SVG badges on native (shown as links)

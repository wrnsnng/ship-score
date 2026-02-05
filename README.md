# Ship Score

> Lighthouse for vibe-coders. Know if your app is ready to ship.

## Opportunity Thesis

Millions of people are vibe-coding apps with AI in 2026. They ship things that "work in demo" but break in production — security holes, performance issues, missing meta tags, broken error pages. They don't know what they don't know.

**Ship Score** scans any URL and gives a beautiful, plain-English report card. No jargon, no overwhelming dashboards — just clear categories with actionable grades.

### Why this wins
- **Design is the moat** — existing tools (Lighthouse, SonarQube) are built for developers. Ship Score is for the millions of new builders who aren't developers.
- **Timing** — vibe coding is the #1 dev trend of 2026. Weekly horror stories of production disasters. Growing gap between "AI built this" and "production-ready."
- **Simplicity** — paste a URL, get a score. That's it.

### Categories
- 🔒 **Security** — Headers, SSL, exposed secrets, auth patterns
- ⚡ **Performance** — Load time, resource weight, render-blocking
- 🔍 **SEO** — Meta tags, Open Graph, sitemap, robots
- ♿ **Accessibility** — Alt tags, headings, viewport, contrast
- 🛡️ **Error Handling** — 404 pages, error states, graceful failures
- 📱 **Best Practices** — Favicon, mobile viewport, charset, HTTPS redirect

### Stack
- **Frontend**: Vite + React + CSS Modules (no Tailwind)
- **Backend**: Bun + Hono API
- **Scanning**: External URL analysis (headers, HTML parsing, resource loading)

### Business Model
- Free: Basic scan (3 categories)
- Pro ($10/mo): Full scan, history, PDF export
- Team ($30/mo): CI integration, monitoring, team dashboards

---

*Built by George for Marc. First prototype: Feb 2026.*

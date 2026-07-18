# Recipe: landing-page

**Build the app's branded landing + download page.** For a desktop app the page is not just
marketing — it's the **distribution surface**: the signed-build download, release notes, and the
GitHub-Releases auto-update feed all live here (docs §10). A web artifact, so it borrows AppyStack
/ frontend-design web knowledge — a clean cross-stack composition.

## Step 1 — Gather identity

Read, don't invent:
- `package.json` → app name, description, version.
- `electron-builder.yml` → `productName`, and `publish.owner` / `publish.repo` (the download source).
- The latest **GitHub Release** for `owner/repo` → the `.dmg` asset URL + release notes. If none
  exists yet, generate the page with a disabled/"coming soon" download and a `TODO` marker.
- Screenshots from `docs/` or a `build/` resources dir if present.

## Step 2 — Generate (files this recipe creates)

```
site/
├── index.html          # self-contained: hero · features · screenshots · download · release notes
└── assets/             # inlined or local images only (no external CDNs)
```

Sections:
- **Hero** — productName + one-line value prop + primary **Download for macOS** CTA (→ latest
  release `.dmg`).
- **Features** — 3–6, pulled from the app's real capabilities (recipes it has, what it does).
- **Screenshots** — from `docs/`/`build/`, or a placeholder with a `TODO`.
- **Releases** — latest version + notes; link to the GitHub Releases page.
- **Footer** — repo link, license.

## Step 3 — Brand + quality

- Apply the **AppyDave brand** (use the `brand-dave:brand` skill if available: colors, fonts,
  tokens). Otherwise a clean neutral theme, theme-aware (light/dark).
- **Responsive** (mobile → desktop); wide content scrolls in its own container, body never
  scrolls horizontally.
- **Self-contained**: inline CSS, local/inlined images — the page renders with no network.

## Step 4 — Hosting (ask first)

The recipe emits a static `site/`. Deploying it is the developer's call — recommend **GitHub
Pages** (pairs naturally with the GitHub-Releases feed), but stay hosting-agnostic. Do **not**
publish a live download link without confirmation.

## Acceptance (verify by rendering)

1. Responsive at mobile + desktop; body has no horizontal scroll.
2. Brand-consistent, theme-aware.
3. The **Download** CTA resolves to the actual latest GitHub Release `.dmg` (or a clearly-marked
   "coming soon" if none exists).
4. Release notes present; renders fully **offline**.

## Never

Do not impersonate a real org/person, fabricate download assets or reviews, or invent a release
that doesn't exist. If there's no release yet, say so on the page.

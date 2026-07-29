# ImageDrip

Generate image batches by driving your own logged-in ChatGPT session — no paid image API.

ImageDrip is a macOS desktop app that hosts real ChatGPT inside its own window, feeds
your prompts in one at a time at a human-like pace, watches the page for each finished
image, then downloads, renames and files it for you.

```
┌─ IMAGEDRIP  ●ChatGPT ──── 4/18 harvested · re-prime in 14 · ~22s ─ [Dial-in|Auto] [▶ Run theme] [■ STOP] ┐
├──────────┬─────────────────┬──────────────────────┬─────────────────────────┤
│ CONTEXT  │   QUEUED        │   HARVESTED          │   native ChatGPT — live │
│ Brand 🔒 │  avocado        │  [img] [img] [img]   │   (your real session;    │
│ Project✎ │  banana         │  [img]               │    the only place you   │
│ [Save ↩] │  mango …        │                      │    ever see it          │
│ [Copy…]  │  [+ import]     │                      │    generating)          │
└──────────┴─────────────────┴──────────────────────┴─────────────────────────┘
```

**Why it exists.** Paid image APIs run about $0.06 an image, so a 100-item catalogue
costs several dollars *every time you re-run it* — and catalogue runs recur. ImageDrip
does the same batch on a ChatGPT subscription you already pay for, for nothing extra.
That single constraint — **no API credits** — is what drives the entire architecture.

> [!WARNING]
> **Automating ChatGPT sits against OpenAI's terms of service, and the cost of getting
> it wrong is your account.** ImageDrip mitigates this with a human-paced feed, a
> mandatory rate-limit pause and an always-live STOP key — mitigations, not guarantees.
> This is a personal tool built with that trade-off made deliberately. Use it knowing
> the risk is yours.

---

## Status

**v1 Batch Runner — built, not yet proven on a full real batch.**

The hard part underneath (the ChatGPT driver: embed, type, detect, harvest) is
**live-verified** against a real session. The run loop on top of it is written but has
not yet been signed off end to end on a real ~15–20 image theme. Watch your first run.

Actively developed. Personal project — not accepting external contributions.

---

## How it works

Prompts stay short because style is set **once per conversation**, not baked into every
prompt.

```
Brand.md      the fixed look — never edited mid-run     "Beauty & Joy"
   └ Project.md   the dialled-in specifics you tune      "Smoothies"
        └ Prompt     one short line per image             "avocado"

   Brand + Project  ──►  the PRIMER, posted once per conversation
   then short prompts inherit that style

   feed ──► ChatGPT generates ──► detect finished image ──► download ──► name ──► file
   every ~18 images: fresh conversation, re-post the primer (fights style drift)
```

The mechanism that makes this safe-ish and reliable:

- **Writes like a human.** Prompts go in through the real Chromium input pipeline
  (a genuine click, then a real paste and Enter), not by scripting the page's
  JavaScript. The page sees trusted input.
- **Reads the DOM.** Completion detection and image URLs come from watching the page,
  which the server can't see at all.
- **No macOS permissions.** No Accessibility grant, no Screen Recording — input and
  reading both happen inside the app's own window.
- **Scoped writes.** Harvested images physically cannot be written outside the
  configured output root.
- **Pauses instead of pushing.** Rate limit, stall, or a refused prompt each stop or
  skip cleanly — it never blindly re-sends.

Full architecture and the rationale for every one of those choices:
[`docs/imagedrip-plan.md`](docs/imagedrip-plan.md).

---

## Get started

**Requirements:** macOS · Node.js 20+ · a ChatGPT account with image generation ·
[`@appydave/core`](https://github.com/appydave) checked out at
`~/dev/ad/apps/appydave-foundation/` (it isn't published to npm yet, so the app links to
it by local path).

There is no packaged installer yet — run it from source:

```bash
git clone git@github.com:appydave/imagedrip.git
cd imagedrip
npm install
npm run dev
```

An ImageDrip window opens. The right-hand column is live ChatGPT — **sign in once, by
hand**. That session persists across restarts.

Then: paste your prompt list into the QUEUED lane, edit **Project** to describe the look
you want, and press **▶ Run theme**.

Step-by-step, including the prompt format and what to do when things go wrong:
**[docs/user-guide.md](docs/user-guide.md)**.

---

## Prompt format

One per line. Blank lines and `#` comments are ignored.

```
avocado
banana
mango
```

Or use a pipe when you want the filename to differ from the prompt:

```
green-smoothie | a tall glass of green smoothie with a mint sprig
```

The part before the pipe becomes the output filename; the part after is what ChatGPT
receives.

---

## Documentation

**[docs/](docs/README.md) — start here.** The index routes you by what you're trying
to do.

| | |
|---|---|
| [User guide](docs/user-guide.md) | Install, run a batch, troubleshoot. The only doc an operator needs. |
| [Plan & requirements](docs/imagedrip-plan.md) | The Northstar — why this exists, the domain model, the locked architecture, scope, risk. |
| [Workflow & UX](docs/ux-and-workflow.md) | The intended end-to-end flow and cockpit design. |
| [Driver spec](docs/specs/webview-harness-spec.md) | How the ChatGPT integration works, and how to re-pin it when it breaks. |
| [Build handover](docs/build-handover.md) | For a developer picking up the build. |

---

## Built on

An [AppyTron](https://github.com/appydave) desktop app — Electron (`electron-vite` +
`electron-builder`) with React, Vite, Tailwind and Zustand in the renderer, on the shared
`@appydave/core` foundation. ImageDrip is AppyTron's first real consumer, so building it
pressure-tests that scaffold; the ChatGPT-driver recipes it produced are contributed back.

```bash
npm run typecheck    # both tsconfig projects
npm test             # vitest
npm run build        # production build
```

---

## Expect maintenance

ImageDrip finds images by reading ChatGPT's page structure, and OpenAI renames things
regularly. When detection breaks, every selector lives in one file —
`src/main/chatgpt-selectors.ts` — and `npx electron probe/probe-c.cjs` re-pins it against
the live page. That's expected upkeep, not a defect. See
[`probe/README.md`](probe/README.md).

---

## License

MIT.

# ImageDrip

Generate image batches by driving your own logged-in ChatGPT session — no paid image API.

ImageDrip is a macOS desktop app that hosts real ChatGPT inside its own window, feeds
your prompts in one at a time at a human-like pace, watches the page for each finished
image, then downloads, renames and files it for you.

```
┌─ IMAGEDRIP ●ChatGPT ─ ● LIVE ─ 4/18 harvested · re-prime in 14 · ~22s ─ [Dial-in|Auto] [▶ Run theme…] [■ STOP] ┐
├──────────┬─────────────────┬──────────────────────┬─────────────────────────┤
│ CONTEXT  │   QUEUED        │   HARVESTED          │   native ChatGPT — live │
│ Brand ✎  │  avocado    ⚡  │  [img] [img] [img]   │   (your real session;    │
│ Project✎ │  banana         │  [img]               │    the only place you   │
│ → ~/Pic… │  mango …        │                      │    ever see it          │
│ Runs (3) │  [+ import]     │                      │    generating)          │
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

**The pipeline works.** A real theme has been run end to end against a live ChatGPT
session — primer posted, prompts dripped, images harvested and filed, no account
trouble.

Current work (**v2 — Usability & Project Identity**) is not new capability; it's making
the cockpit comfortable to sit in for an hour. Projects with real output folders, run
history, a genuine dial-in mode, and a run-entry choice that stops Auto from destroying
your dial-in are built and awaiting an in-app acceptance pass. A wider/resizable ChatGPT
panel, an account switcher and a design polish pass are next.
See [`docs/requirements-v2-usability.md`](docs/requirements-v2-usability.md) and the
[Known limits](docs/user-guide.md#known-limits).

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

Every run lands in its own dated folder alongside a `manifest.json` recording the exact
primer as posted, every prompt and its outcome, and the timings — so a folder of images
months later still explains itself.

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
you want, test a couple of images in **Dial-in** mode, and press **▶ Run theme…**.

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
| [v2 requirements](docs/requirements-v2-usability.md) | Usability & Project Identity — what's being built now and the live-UAT findings that drove it. |
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

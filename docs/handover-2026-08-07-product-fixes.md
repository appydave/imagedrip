---
doc: handover
project: imagedrip
created: 2026-08-07
updated: 2026-08-08 — first real workload run end to end; feed now verifies delivery
state: clean. All work committed and pushed at 9f49732. Nothing half-done.
  Next unit of work is a CHOICE, not a continuation — see "Where to pick up".
---

# Handover — ImageDrip

> **Do not rebuild A1–A9.** They shipped at `3d8d4f2`. This file used to queue them
> up and said "nothing started"; that was corrected on 2026-08-07.

## Launch line

```
cd /Users/davidcruwys/dev/ad/apps/imagedrip
```
```
claude --permission-mode auto --model opus -n imagedrip "You must be running in /Users/davidcruwys/dev/ad/apps/imagedrip — verify your cwd before anything else and STOP if it differs. Read /Users/davidcruwys/dev/ad/apps/imagedrip/docs/handover-2026-08-07-product-fixes.md in full before doing anything. Never write to the ChatGPT webview by any path. Never call repo.attach — it has a known defect that publishes projects into the wrong repo. Ask David explicitly before any run.start, every time."
```

---

## State — everything is committed and green

| | |
|---|---|
| Branch | `main`, clean, pushed. Head `9f49732`. |
| Tests | 320 passing. `npm run typecheck` and `npm run build` green. |
| App | Runs. Driven end to end over the control surface on 2026-08-07. |

**Start the app with `npm run dev:clean`** (stop-then-start). Not `npm run dev` —
ImageDrip holds a single-instance lock, so a second `dev` against a running app
surrenders and focuses the old window. It looks like it worked and you end up
driving a build you stopped editing an hour ago. `dev:stop` alone stops it.

---

## What shipped

**A1–A9 (`3d8d4f2`)** — brand can be `(none)`; `outcome` written on app-quit;
`BOOTSTRAP_STALL_MS` raised above the observed 300s worst case; Live UAT on by
default; `theme.rename`; `brand.delete` / `template.delete` / `project.delete`
(gated); plus doc corrections. Detail in `docs/review-usability-and-product-fit.md`.

**`31b6846`** — `repo.attach` gated + its defect documented on the verb itself;
`.mcp.json` committed; the git-work-tree log line reworded and dropped to debug.

**`68f2e76`** — `dev:stop` / `dev:clean`, ported from KBDE's `scripts/dev-stop.mjs`
including KYB-315 (the Electron main process has no greppable identity — use a
pid file; ImageDrip's is in `control.json`) and KYB-314 (bracket classes so a
`pkill` pattern cannot match its own shell).

**`9f49732`** — **`feed` now verifies delivery.** It used to do five things and
check none, so a missed click, a stolen focus, a swallowed paste and an ignored
Enter all produced one observable: the runner entered `awaiting` and hung until
the stall cap. It now reads the composer back — after paste it must hold text or
show an attachment chip, after submit it must be **empty** — and throws
otherwise. `batch-runner.feedNext` catches that and PAUSES with the reason.
Also: queued prompts can finally be opened to read their body.

---

## The first real workload — it worked

`docs/samples/12-days-thumbnails/` — twelve FliThumb `TitleThumbPair` prompts for
the *12 Days of Claudmas* series, built against the real AppyDave brand.

Three ran on 2026-08-07:
`~/Pictures/ImageDrip/12-days-of-claudmas/2026-08-07-2133-twelve-days-of-claudmas/`
— **3/3 harvested, `outcome: complete`,** generations 36s / 61s / 43s, no pauses.

**The finding:** ChatGPT rendered the ghost watermark correctly — clean,
correctly-spelled letterforms at low opacity bleeding off two edges. So FliThumb's
*subliminal/ambient* text layer is viable through this engine, even though
composed-in *hook* text would not be. David predicted this; it is now evidence.

The earlier `…-2103-…` folder is the before-picture: 0/3 and
`stalled — no image in 390s`, from the run before `feed` verified anything.

---

## Where to pick up — a choice, not a continuation

Nothing is half-finished. Pick one:

1. **Run the remaining nine.** `docs/samples/12-days-thumbnails/remaining-nine.blocks.txt`,
   import with mode `add` format `blocks`. Cheapest way to get more evidence, and
   it produces images David can actually use. **`run.start` needs his explicit go,
   every time.**
2. **Interpolation variables.** The biggest product gap found by real use: every
   prompt block repeats the same six field labels and only values differ. Shape
   belongs on `Template.promptShape`, values on `Prompt.variables`, resolved at
   feed time — the substitution already exists in `renderListPrompt` and was only
   ever wired to the LIST PROMPT helper. **Deliberately deferred:** one batch
   proves duplication; a second, non-thumbnail template proves the shape.
3. **`RunConfig.limit`.** There is no way to run a SUBSET. `run.start` runs the
   whole queue and `run.inject-prompt` is never exposed, so "run 3" meant
   narrowing the queue by hand. A sixth `RunConfig` field fixes it without any new
   write path to the webview.
4. **Fix `repo.attach` properly** (import-only + explicit per-record publish).
   Required before repos are usable; not required while everything lives in
   `~/Pictures`.
5. **v4 WP4 — the in-app `Context ｜ Chat` pane.** Still the largest unfinished
   thing. Design decided: tab the CONTEXT column (`requirements-v4-resident-chat.md §5`).

---

## Loose ends, none blocking

- **`running: true` after a completed run.** `finishRun` does not set `stopped`,
  so `/v1/health` still reports running once the queue empties. Cosmetic, but it
  misleads a caller polling for completion.
- **`dev:watch`'s own restart bypasses `before-quit`.** The `…-2103-…` manifest has
  no `outcome` because electron-vite killed the app rather than quitting it. A2
  covers a real quit; it does not cover the dev supervisor.
- **No log file.** The logger only writes to stdout, so there is no forensic trail
  after a failure. Piping `dev:watch` through `tail` loses it entirely — if you
  background the dev server, tee to a file.
- **`flilaunch` has `stash@{0}`** on this machine — David's `.cache/pulse/sessionend.log`,
  stashed to allow the pull that brought `flithumb-brief.md` over. His to drop.
- **Live UAT corpus: 4 snags, 0 verdicts.** Image verdicts are the half still
  empty, and they are the tuning signal. Judging the three harvested plates costs
  a minute and is worth more than another batch.

---

## Gotchas that still bite

- **`npm` only.** `packageManager` pins `npm@11.11.0`; this machine has 10.9.8,
  which rewrites `package-lock.json` on every install. Cosmetic — `git checkout
  package-lock.json` before committing. pnpm blocks the Electron postinstall.
- **Import Zod from `@appydave/core`, never `zod`.** v3.25 — no `z.toJSONSchema()`.
- **Zod v3 arrays hold bounds in `_def.minLength`/`maxLength`, not `_def.checks`.**
- **`/v1/call/:verb` takes the BARE value.** `/v1/verbs` publishes a `{payload}`
  wrapper for scalar verbs, but that is an MCP transport detail — posting it 422s.
  A 422 body has no `result`, so a client reading `result.brand` gets `null`, which
  looks exactly like a successful switch to `(none)`. Cost a false bug report.
- **The control token is regenerated every launch.** Re-read `control.json`; never
  cache it across a restart.
- **A fresh Electron profile looks exactly like David's real data** — `seedDefaults`
  seeds "Beauty & Joy" / "Smoothies". Check the prompt count, not the name.
- **`WebviewHarness.feed` still pastes into current focus when `locateInput` misses.**
  That is deliberate — the post-condition catches it now — but do not read the
  warning as harmless.
- **One ImageDrip at a time** (profile lock).

---

## Ruled out — do not reintroduce

- **AppleScript** for driving the app. A coordinate click always "succeeds".
- **A `ui.state` verb** for a test harness — it would test its own hook.
- **A `RunConfig` settings panel** — `run.start` already takes all five fields.
- **Widening the control-surface bind** — SSH port-forward to `127.0.0.1:7180`.
- **B1–B4, the `uat/` CDP tier.** ImageDrip has a control seam; driving verbs beats
  driving pixels. Only worth it for asserting things about the UI itself.

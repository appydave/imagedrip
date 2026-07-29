---
doc: user-guide
project: imagedrip
audience: someone OPERATING ImageDrip (not building it)
status: current for v1 Batch Runner
created: 2026-07-29
pairs_with: imagedrip-plan.md (the why), ux-and-workflow.md (the design intent)
---

# ImageDrip — User Guide

How to install ImageDrip, point it at a batch of prompts, and walk away while it
generates and files the images.

> [!IMPORTANT]
> **Status: v1 Batch Runner is built but not yet proven on a full real theme.**
> The ChatGPT driver underneath it is live-verified; the run loop on top of it has not
> yet been signed off end to end on a real ~15–20 image batch. Treat your first run as
> the proving run — watch it, don't walk away. See [Known limits](#known-limits).

---

## Contents

- [What ImageDrip is](#what-imagedrip-is)
- [Before you start](#before-you-start)
- [Install and run](#install-and-run)
- [First run — sign in to ChatGPT](#first-run--sign-in-to-chatgpt)
- [The three things ImageDrip works with](#the-three-things-imagedrip-works-with)
- [The screen](#the-screen)
- [Running a batch](#running-a-batch)
- [Where your images go](#where-your-images-go)
- [Controls and safety](#controls-and-safety)
- [Troubleshooting](#troubleshooting)
- [Known limits](#known-limits)

---

## What ImageDrip is

ImageDrip is a macOS desktop app that generates images **by driving your own logged-in
ChatGPT session** — the same one you use in a browser — instead of a paid image API.

It embeds real ChatGPT inside its own window, types your prompts in one at a time at a
human-like pace, watches the page for each finished image, then downloads, renames and
files it automatically.

**Why it exists:** paid image APIs cost roughly $0.06 an image, so a 100-image catalogue
run is several dollars *every time you re-run it*. ImageDrip does the same batch on a
ChatGPT subscription you already pay for, for no extra cost. That single constraint —
no API credits — is why the app works the way it does. Full rationale:
[`imagedrip-plan.md`](imagedrip-plan.md).

> [!WARNING]
> **Account risk is real.** Automating ChatGPT — even through your own real, logged-in
> session — sits against OpenAI's terms of service. The cost of getting this wrong is
> your **account**, not a failed run. The human-paced feed, the rate-limit pause and the
> always-live STOP key are mitigations, not guarantees. Run it deliberately, on batches
> you actually need, and stop if ChatGPT starts behaving oddly.

---

## Before you start

| You need | Why |
|---|---|
| **macOS** | The app is built and verified on macOS only. |
| **Node.js 20+** and npm | To install and run the app from source. |
| A **ChatGPT account with image generation** | ImageDrip drives *your* session. If you can't make images by hand in ChatGPT, ImageDrip can't either. |
| The **`@appydave/core` package** checked out at `~/dev/ad/apps/appydave-foundation/` | It is not published to npm yet; the app links to it by local path. |

ImageDrip needs **no** macOS Accessibility or Screen Recording permission — it types and
reads entirely inside its own window.

There is no packaged installer yet. You run it from source.

---

## Install and run

```bash
cd ~/dev/ad/apps/imagedrip
npm install
npm run dev
```

An ImageDrip window opens. That's it — there is nothing to configure first.

For a production-mode run instead of the dev server:

```bash
npm run build
npm start
```

---

## First run — sign in to ChatGPT

The right-hand column of the window is **live ChatGPT**, not a picture of it. On first
run it will show the ChatGPT sign-in page.

**Sign in there once, by hand.** Your session is stored in a private, persistent browser
profile belonging to ImageDrip, so it survives quitting and reopening the app. You should
not have to sign in again.

Confirm it worked: the ChatGPT column shows your normal chat interface, and the pill in
the top bar next to the ImageDrip name shows a green dot.

---

## The three things ImageDrip works with

ImageDrip separates *style* from *subject*, which is what lets your prompts stay short.

```
Brand      the fixed look that never changes mid-run    e.g. "Beauty & Joy"
  └ Project   the dialled-in specifics for this batch    e.g. "Smoothies"
      └ Prompt   one short line per image                e.g. "avocado"
```

- **Brand + Project together make the *primer*** — one long message ImageDrip posts
  **once** at the start of a conversation, which tells ChatGPT the style, the framing,
  and the rule "one image per message I send".
- **Each prompt is then just a word or a short line.** It inherits the style from the
  primer. You are not re-describing the look 116 times.
- Every ~18 images ImageDrip starts a **fresh conversation and re-posts the primer**.
  Long conversations drift — the look slowly wanders. Re-priming resets it.

**Brand is read-only in practice.** Once you have it, you don't touch it mid-run.
**Project is the layer you tune** — that's the one with an edit box.

Deeper background on the model: [`imagedrip-plan.md §3`](imagedrip-plan.md).

---

## The screen

```
┌─ IMAGEDRIP  ●ChatGPT ──── 4/18 harvested · re-prime in 14 · ~22s ─ [Dial-in|Auto] [▶ Run theme] [■ STOP] ┐
├──────────┬─────────────────┬──────────────────────┬─────────────────────────┤
│ CONTEXT  │   QUEUED        │   HARVESTED          │   native ChatGPT — live │
│ Brand 🔒 │  avocado        │  [img] [img] [img]   │   (your real session;    │
│ Project✎ │  banana         │  [img]               │    this is the only     │
│ [Save ↩] │  mango …        │                      │    place you see it     │
│ [Copy…]  │  [+ import]     │                      │    generating)          │
└──────────┴─────────────────┴──────────────────────┴─────────────────────────┘
                  activity line: what the run is doing right now
```

**Top bar** — progress (`harvested / total`), the countdown to the next re-prime, the
measured average time per image, the mode toggle, the run button, and STOP.

**CONTEXT rail** (collapsible, click the vertical `CONTEXT ▸` strip to reopen):
- **Brand** — shown, not editable.
- **Project** — editable. `Save project ↩` stores your edit.
- `Copy primer` — puts the composed Brand+Project text on your clipboard, so you can
  paste it into ChatGPT by hand.
- `Copy prompt` — puts the next queued prompt on your clipboard.

**QUEUED** — prompts waiting to run, plus the import box.

**HARVESTED** — thumbnails of images already downloaded and filed. This grid starts
empty and only fills from real harvests.

**ChatGPT column** — the live app. ImageDrip deliberately does **not** show a
"generating" state of its own; generating happens inside ChatGPT, and that panel is the
honest view of it.

---

## Running a batch

### 1. Import your prompts

Click into the import box in the QUEUED lane and paste your list. Importing **replaces**
the queue — a fresh import defines a fresh run.

The format is deliberately simple:

```
# lines starting with a hash are ignored, and so are blank lines

avocado
banana
mango
```

One prompt per line. Or, if you want to control the output filename separately from the
prompt text, use a pipe:

```
avocado | a whole ripe avocado, halved, stone visible
green-smoothie | a tall glass of green smoothie with a mint sprig
```

The part **before** the pipe is the *subject* — it becomes the filename. The part after
is what actually gets sent to ChatGPT. Without a pipe, the subject is taken from the
first few words.

### 2. Set the style

Open the CONTEXT rail and edit **Project** until it describes what you want for this
batch. It must tell ChatGPT to return **one image per message**, or ChatGPT will just
chat back at you. The seeded example shows the shape:

> Project: Smoothies. For EACH message I send (a single fruit or ingredient name),
> generate ONE photorealistic product image of that fruit as a fresh smoothie or whole
> fruit, in the Beauty & Joy style — warm natural light, soft wooden background, no text
> and no words. Reply with only the image.

Click **Save project ↩**.

**Tip:** before committing to a long run, test the look by hand. Use `Copy primer`,
paste it into the ChatGPT panel, then `Copy prompt` and paste one prompt. Look at the
result. Adjust Project. Repeat. It costs you nothing and saves a 100-image batch coming
out wrong.

### 3. Run

Press **▶ Run theme**. ImageDrip then, on its own:

1. Opens a fresh ChatGPT conversation.
2. Posts the primer and waits for it to land.
3. Feeds the first prompt.
4. Waits for the image to finish, downloads it, names it, files it, marks it harvested.
5. Waits a few random seconds, feeds the next one.
6. Every 18 harvested images, starts a fresh conversation and re-primes.

The activity line at the bottom tells you what's happening: `priming a fresh chat…`,
`feeding: avocado`, `awaiting image: avocado`, `next in 5s`.

Timing is jittered on purpose — roughly 3.5 to 6.5 seconds between images, on top of
however long ChatGPT actually takes. ImageDrip measures the real generation time as it
goes and shows the rolling average in the top bar.

### 4. When it finishes

The run reports `done`. To run the same theme again, press **↺ Reset** — that puts every
prompt back in the queue and clears the harvested marks. (It does **not** delete the
image files already on disk.)

---

## Where your images go

Harvested images are written to:

```
~/Library/Application Support/imagedrip/harvest/<subject-slug>.png
```

So a prompt whose subject is `green smoothie` lands as `green-smoothie.png`.

Your Brand, Project and prompt queue are stored alongside it in
`~/Library/Application Support/imagedrip/domain.json` and survive restarts.

> [!NOTE]
> **Images do not yet land in your project's own output folder.** The plan is for each
> project to name its own output directory and for ImageDrip to file straight into it.
> That routing isn't wired yet — everything currently goes to the single harvest folder
> above. Copy them where you need them for now. See [Known limits](#known-limits).

Writes are path-scoped: ImageDrip physically cannot write outside its harvest root, so a
bad prompt name can't scatter files across your disk.

---

## Controls and safety

| Control | What it does |
|---|---|
| **▶ Run theme** | Starts the batch (appears when there are queued prompts). |
| **⏸ Pause** | Holds the run where it is. The ChatGPT session stays as it was. |
| **▶ Resume** | Continues, re-feeding the prompt it was waiting on. |
| **■ STOP** | Halts the run immediately and cleanly. |
| **`Cmd+Shift+.`** | Global STOP — works even when ImageDrip isn't the front app. |
| **↺ Reset** | Re-queues every prompt so the theme can run again. |

**STOP never logs you out.** It halts the loop and leaves the ChatGPT panel and your
session exactly where they are, so you can look at what happened.

ImageDrip pauses itself, rather than pushing on, in three situations:

- **ChatGPT says you've hit an image limit** → pause and tell you. It never keeps
  hammering a rate-limited account.
- **No image arrives within 3 minutes of feeding a prompt** → pause and tell you. It
  never blindly re-sends, because that risks a double submission.
- **ChatGPT refuses a prompt** (content policy) → logs it, skips that one prompt, and
  carries on with the rest.

---

## Troubleshooting

**The ChatGPT column is blank or showing a login page mid-run.**
Your session expired. Sign in again by hand in that panel; the run can then be resumed.

**Nothing happens when I press Run theme.**
Check there are prompts in the QUEUED lane. If everything is already marked harvested,
the button becomes `↺ Reset` instead.

**ChatGPT replies with text instead of images.**
Your Project text isn't instructing it firmly enough. It must say, explicitly, to
generate one image per message and to reply with only the image. Edit Project, save,
and start a new run.

**Images are drifting away from the look partway through.**
That's exactly what re-priming exists to fix, and it happens every 18 images by default.
If drift is showing up sooner than that, tighten the Project text — a more specific
primer holds a look longer.

**The run stalls on every prompt / no images are ever detected.**
ChatGPT changed its page structure. This is expected maintenance, not a bug — the app
finds images by reading ChatGPT's DOM, and OpenAI renames things regularly. Every
selector lives in one file, `src/main/chatgpt-selectors.ts`. Re-pin it against the live
page with:

```bash
npx electron probe/probe-c.cjs
```

Details in [`probe/README.md`](../probe/README.md) and
[`specs/webview-harness-spec.md §4`](specs/webview-harness-spec.md).

**`npm install` fails on `@appydave/core`.**
That package isn't published; the app links to it by relative path. Make sure it exists
at `~/dev/ad/apps/appydave-foundation/packages/core`.

**Something I copied got pasted into ChatGPT instead of my prompt.**
ImageDrip uses the clipboard to feed prompts. Avoid copying things while a batch is
running.

---

## Known limits

Honest list of what v1 does not do yet.

| Limit | Detail |
|---|---|
| **Not yet proven end to end** | The Batch Runner is built; a full real theme has not yet been signed off. Watch your first run. |
| **Output routing** | Images go to the app's own harvest folder, not a per-project output directory. |
| **Dial-in mode** | The `Dial-in / Auto` toggle currently changes nothing — dial-in is done manually with the Copy buttons. |
| **Project copy-back** | `Save project ↩` saves inside ImageDrip only. It does not yet copy Project.md back to its source file. |
| **Brand editing** | Brand is not editable in the UI. |
| **Provenance log** | Per-image provenance records (prompt → URL → file → time) are implemented but not yet written during a run. |
| **Run tuning** | Cadence and chunk size are fixed defaults; there is no settings UI. |
| **Rate-limit detection** | The pause-on-limit path has not been verified against a live rate limit — only against the expected page markers. |
| **Reference images** | Attaching a reference image per prompt is in the data model but not implemented. |
| **Other providers** | ChatGPT only. DZINE / Higgsfield are planned behind the same model. |
| **Packaging** | Runs from source; there's no signed `.app` installer yet. |

---

**Next:** the reasoning behind all of this is in
[`imagedrip-plan.md`](imagedrip-plan.md); the intended full workflow including the
dial-in loop is in [`ux-and-workflow.md`](ux-and-workflow.md).

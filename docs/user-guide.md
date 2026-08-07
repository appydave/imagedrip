---
doc: user-guide
project: imagedrip
audience: someone OPERATING ImageDrip (not building it)
status: current as of v2 WP1–WP5 (usability slice); WP6–WP7 not built
created: 2026-07-29
last_updated: 2026-07-29
pairs_with: imagedrip-plan.md (the why), requirements-v2-usability.md (what's changing next)
---

# ImageDrip — User Guide

How to install ImageDrip, point it at a batch of prompts, and let it generate and file
the images for you.

> [!NOTE]
> **Status: the pipeline works.** A real theme has been run end to end — primer posted,
> prompts dripped, images harvested, no account trouble. The current v2 work is about
> making it comfortable to sit in for an hour, not about whether it works.
> Some of that usability work is awaiting sign-off — see [Known limits](#known-limits).

---

## Contents

- [What ImageDrip is](#what-imagedrip-is)
- [Before you start](#before-you-start)
- [Install and run](#install-and-run)
- [First run — sign in to ChatGPT](#first-run--sign-in-to-chatgpt)
- [The three things ImageDrip works with](#the-three-things-imagedrip-works-with)
- [The screen](#the-screen)
- [Set up a project](#set-up-a-project)
- [Get your prompts in](#get-your-prompts-in)
- [Dial in the look](#dial-in-the-look)
- [Run the batch](#run-the-batch)
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
files it automatically into a dated folder with a record of exactly how it was made.

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
| A **ChatGPT account with image generation** | ImageDrip drives *your* session. If you can't make images by hand in ChatGPT, ImageDrip can't either. A free plan will hit image limits fast. |
| The **`@appydave/core` package** checked out at `~/dev/ad/apps/appydave-foundation/` | It is not published to npm yet, so the app links to it by local path. |

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

An ImageDrip window opens.

For a production-mode run instead of the dev server:

```bash
npm run build
npm start
```

---

## First run — sign in to ChatGPT

The right-hand column of the window is **live ChatGPT**, not a picture of it. On first
run it shows the ChatGPT sign-in page.

**Sign in there once, by hand.** Your session is stored in a private, persistent browser
profile belonging to ImageDrip, so it survives quitting and reopening the app.

> [!TIP]
> The panel is narrow, and if you sign in with Google it may auto-pick the wrong
> account with no easy way to change it. If that happens, sign out from inside the panel
> and sign in again choosing the right account. A proper account switcher and a wider,
> resizable panel are the next piece of work (WP6) — not built yet.

You'll know it worked when the panel shows your normal chat interface and the pill at
the top of the window shows a green dot.

---

## The three things ImageDrip works with

ImageDrip separates *style* from *subject*, which is what lets your prompts stay short.

```
Brand      the fixed look, shared across projects    e.g. "Beauty & Joy"
  └ Project   the dialled-in specifics for this work  e.g. "Smoothies"
      └ Prompt   one short line per image             e.g. "avocado"
```

- **Brand + Project together make the *primer*** — one long message posted **once** at
  the start of a conversation, telling ChatGPT the style, the framing, and the rule
  "one image per message I send".
- **Each prompt is then just a word or a short line.** It inherits the style from the
  primer. You are not re-describing the look 116 times.
- Every ~18 images an automated run starts a **fresh conversation and re-posts the
  primer**. Long conversations drift — the look slowly wanders. Re-priming resets it.

Both Brand and Project are editable, and you can keep several of each. **Brand locks
while a run is live** (changing the look mid-run is exactly what you don't want), and
the UI tells you that's why it's locked.

---

## How Brand, Project and Run fit together

This is the part that isn't obvious from the screen, and getting it wrong causes real
confusion about where files end up.

```
Brands  (many)          Projects  (many)              Runs  (many per project)
─────────────           ────────────────              ───────────────────────
Beauty & Joy            Smoothies  ──► output dir ──► 2026-08-03-1233-smoothies/
AI-TLDR                 Characters ──► output dir ──► 2026-08-03-1512-smoothies/
                                                      …

  any Brand  ×  any Project   →   the primer for a run
```

**Brands and Projects are independent lists.** You pick one of each; the pair composes
the primer. A Brand is not owned by a Project, which is the whole point — the same look
can drive several bodies of work without being duplicated.

**The Project owns the queue and the output folder.** Switching projects switches both.
Change the folder any time on the Project card (**change…**), not just when creating it.

**A Run is created for you — there is no "new run" button.**

- **▶ Run theme…** starts one, and it gets its own dated subfolder.
- The first **⚡ inject** in Dial-in lazily opens one too, recorded as `mode: dial-in`.
- Runs never share a folder. A second run cannot touch the first run's files.

**A run is not the same thing as a ChatGPT conversation.** They're related but not
one-to-one, in both directions:

- *One run can span several conversations.* Every ~18 images the run opens a fresh chat
  and re-posts the primer, all within the same run and the same folder.
- *One conversation can host several runs.* Choosing **Continue in this chat** starts a
  new run inside the conversation you're already in.

The run-entry choice — Continue vs fresh — is the only thing that links a run to a
conversation. Nothing else in the app binds them.

> **There is no "profile".** If you're looking for one place holding "all my settings",
> it doesn't exist by design. The state is just *(active Brand, active Project)*, and the
> Project carries its queue and output folder with it.

---

## The screen

```
┌─ IMAGEDRIP ●ChatGPT ── ● LIVE ─ 4/18 harvested · re-prime in 14 · ~22s ─ [Dial-in|Auto] [▶ Run theme…] [■ STOP] ┐
├──────────┬─────────────────┬──────────────────────┬─────────────────────────┤
│ CONTEXT  │   QUEUED        │   HARVESTED          │   native ChatGPT — live │
│ Brand ✎  │  avocado    ⚡  │  [img] [img] [img]   │   (your real session;    │
│ Project✎ │  banana         │  [img]               │    this is the only     │
│ → ~/Pic… │  mango …        │                      │    place you ever see   │
│ Runs (3) │  [+ import]     │                      │    it generating)       │
└──────────┴─────────────────┴──────────────────────┴─────────────────────────┘
                  activity line: what the run is doing right now
```

**Top bar** — a state chip (`● LIVE` / `⏸ PAUSED` / `○ IDLE`), progress
(`harvested / total`), the countdown to the next re-prime, the measured average time per
image, the mode toggle, the run button, and STOP.

**CONTEXT rail** (collapsible — click the vertical `CONTEXT ▸` strip to reopen):
- **Brand** — editable, selectable, and you can create new ones with `＋ new`. Locked
  during a run.
- **Project** — editable and renameable, with its output folder shown underneath.
- Both **autosave** as you type. A `saved ✓` / `● unsaved` / `saving…` indicator tells
  you where you stand; there's still a Save button if you prefer pressing one.
- **Copy primer** / **Copy prompt** — each shows a description and a preview of exactly
  what lands on your clipboard.
- **Listing-prompt helper** — a canned prompt for asking ChatGPT to generate an import
  list in the right format.
- **Runs** — every previous run of this project. Click one to see it exactly as it ran.

**QUEUED** — prompts waiting to run, plus the import box. Hovering a row reveals `⚡`.

**HARVESTED** — thumbnails of images already downloaded and filed.

**ChatGPT column** — the live app. ImageDrip deliberately does **not** show a
"generating" state of its own; generating happens inside ChatGPT, and that panel is the
honest view of it.

---

## Set up a project

A **project** owns a name, a Project.md body, and a folder on disk where its images land.

Click `＋ new` next to the project name. Give it a name, and either choose an output
folder or leave it — the default is `~/Pictures/ImageDrip/<project-name>`.

Nothing is saved until you press **Create**, so clicking `＋ new` and changing your mind
leaves no mess behind.

---

## Get your prompts in

Paste your list into the import box in the QUEUED lane. The format is deliberately
simple:

```
# lines starting with a hash are ignored, and so are blank lines

avocado
banana
mango
```

One prompt per line. Or use a pipe when you want the filename to differ from the prompt:

```
avocado | a whole ripe avocado, halved, stone visible
green-smoothie | a tall glass of green smoothie with a mint sprig
```

The part **before** the pipe becomes the output filename; the part after is what ChatGPT
receives. Without a pipe, the filename comes from the first few words.

Then choose what to do with them:

- **Add to queue** — appends to whatever is already queued.
- **Replace the queue** — discards the queued prompts and starts fresh. This asks you to
  confirm, because it throws work away.

Either way, **already-harvested prompts survive** — replacing the queue never destroys
your record of what's already been made.

> [!TIP]
> Use the listing-prompt helper in the CONTEXT rail to get ChatGPT to write your list
> for you in the right shape — it asks for names only, in a code block, with a limit.

---

## Dial in the look

Before committing to a long run, get the style right on a couple of images. This costs
you almost nothing and saves a 100-image batch coming out wrong.

Switch the mode toggle to **Dial-in**, then:

1. Press **⚡ Initialise project** — this pastes the composed primer into the live
   ChatGPT chat and sends it. No copying, no clicking into the panel.
2. Hover a queued prompt and click **⚡ inject** — that one prompt is sent, generated,
   and harvested, just like a real run but one at a time.
3. Look at the result. Talk to ChatGPT directly in the panel if you want to refine it —
   "make the background warmer", "no text". It's a real chat; you can negotiate.
4. When you're happy, **fold what you learned back into Project.md** in the CONTEXT
   rail. This matters — see the warning below.

You can still do all of this by hand with `Copy primer` and `Copy prompt` if you prefer.

> [!IMPORTANT]
> Refinements you negotiate *in the chat* live only in that conversation. When a run
> re-primes a fresh chat (every ~18 images), it rebuilds the primer from your **saved
> Project.md** — so anything you only said out loud in the chat is lost at that point.
> Fold it into Project.md before a long run.

---

## Run the batch

Press **▶ Run theme…**. It asks you how to start, which matters a lot if you've just
been dialling in:

| Choice | What it does | Use when |
|---|---|---|
| **Continue in this chat** | No new conversation, no primer — starts feeding the queue into the chat you're already in. | You've just dialled in and want to keep everything you negotiated. This is the default when the chat is already primed. |
| **Start a fresh chat** | New conversation → primer posted → feed. Dialled-in refinements are **not** carried over. | A clean run from your saved Brand + Project. The default when the chat isn't primed. |

Then ImageDrip works through the queue on its own:

1. Feeds a prompt.
2. Waits for the image to finish, downloads it, names it, files it, marks it harvested.
3. Waits a few random seconds, feeds the next.
4. Every 18 harvested images, starts a fresh conversation and re-primes.

The activity line at the bottom tells you what's happening: `feeding: avocado`,
`awaiting image: avocado`, `next in 5s`.

Timing is jittered on purpose — roughly 3.5 to 6.5 seconds between images, on top of
however long ChatGPT actually takes. ImageDrip measures the real generation time as it
goes and shows the rolling average in the top bar.

When it finishes, press **↺ Reset** to put every prompt back in the queue for another
run. That never deletes image files already on disk.

---

## Where your images go

Each run gets its own dated folder inside the project's output directory:

```
~/Pictures/ImageDrip/<project>/
└── 2026-07-28-0759-smoothies/       ← YYYY-MM-DD-HHmm-<theme>
    ├── avocado.png
    ├── banana.png
    ├── manifest.json                ← how this run was made
    └── provenance.jsonl             ← one line per harvested image
```

**`manifest.json`** is the durable record: the project and theme, timestamps, the
**exact primer text as it was posted**, every prompt with its outcome and generation
time, re-prime boundaries, and any refusals or pauses. It's what lets you look at a
folder of images months later and know precisely what produced them.

Previous runs are listed under **Runs** in the CONTEXT rail. Click one to see its images
and the primer that made them, and use **Reveal in Finder ↗** to open the folder.

A second run never touches the first run's folder.

Your projects, brands and queue live in
`~/Library/Application Support/imagedrip/domain.json` and survive restarts.

Writes are path-scoped: ImageDrip cannot write outside the active project's output
folder, so a bad prompt name can't scatter files across your disk.

---

## Controls and safety

| Control | What it does |
|---|---|
| **▶ Run theme…** | Opens the Continue-vs-fresh choice, then starts the batch. |
| **⚡ Initialise project** | Dial-in: posts the primer into the live chat and sends it. |
| **⚡ inject** (on a queued row) | Dial-in: sends just that one prompt and harvests it. |
| **⏸ Pause** | Holds the run where it is. The ChatGPT session stays as it was. |
| **▶ Resume** | Continues, re-feeding the prompt it was waiting on. |
| **■ STOP** | Halts the run immediately and cleanly. Only shown while something is running. |
| **`Cmd+Shift+.`** | Global STOP — works even when ImageDrip isn't the front app. |
| **↺ Reset** | Re-queues every prompt so the theme can run again. |

**STOP never logs you out.** It halts the loop and leaves the ChatGPT panel and your
session exactly where they are, so you can see what happened.

ImageDrip pauses itself, rather than pushing on, in three situations:

- **ChatGPT says you've hit an image limit** → pause and tell you. It never keeps
  hammering a rate-limited account.
- **No image arrives within 3 minutes of feeding a prompt** → pause and tell you. It
  never blindly re-sends, because that risks a double submission.
- **ChatGPT refuses a prompt** (content policy) → logs it, skips that one prompt, and
  carries on with the rest.

It also never fires the next prompt until the previous image has landed.

---

## Troubleshooting

**A prompt was pasted into ChatGPT but never sent.**
The Enter landed before the composer was ready. The waits after opening a chat and after
posting the primer were lengthened to fix this; if you still see it, pause, send the
stuck message by hand, and resume.

**The ChatGPT column is blank or showing a login page mid-run.**
Your session expired. Sign in again by hand in that panel, then resume.

**ChatGPT replies with text instead of images.**
Your Project text isn't instructing it firmly enough. It must say, explicitly, to
generate one image per message and to reply with only the image.

**Images drift away from the look partway through.**
That's what re-priming exists to fix, and it happens every 18 images. If drift shows up
sooner, tighten the Project text. And check that your refinements are actually saved in
Project.md rather than only spoken into the chat.

**I dialled in a look and pressing Run threw it away.**
That was the old behaviour. Choose **Continue in this chat** in the run dialog.

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
ImageDrip uses the clipboard to feed prompts. Avoid copying things while a batch runs.

---

## Known limits

Honest list of what doesn't work yet, and what hasn't been proven.

### Not yet built

| Limit | Detail |
|---|---|
| **No account switcher** | One hard-coded session. If Google auto-picks the wrong account, you have to sign out inside the panel and back in. (WP6) |
| **Design polish pass** | The cockpit is functional, not finished. (WP7) |
| **Project copy-back** | Project.md is saved inside ImageDrip; it isn't copied back out to a source file elsewhere. |
| **Reference images** | Attaching a reference image per prompt is in the data model but not implemented. |
| **Other providers** | ChatGPT only. DZINE / Higgsfield are planned behind the same model. |
| **Packaging** | Runs from source; there's no signed `.app` installer. |
| **No settings screen for run tuning** | Cadence, chunk size and the settle delays have no controls on the rail. They are **not** unreachable — see below. |

### Fixed since this list was written

Two rows sat here describing the app as less capable than it is. Both are gone,
and both are worth naming, because an honest limits list that *understates* the
app costs you the feature just as surely as one that overstates it.

| Was listed as | Actually |
|---|---|
| *"ChatGPT panel is narrow and fixed — it can't be widened or resized"* | The panel has **S / M / L** buttons (380 / 560 / 820px) above it **and a draggable edge**, and it remembers the width you leave it at. So does the CONTEXT rail on the left. |
| *"Prompt intake via API/MCP — there's no programmatic intake"* | There is. ImageDrip runs a loopback control surface, and an operator chat can read the domain and write prompts straight into the queue. See [`requirements-v4-resident-chat.md`](requirements-v4-resident-chat.md). |

**On run tuning:** there is no settings *screen*, and there is deliberately not
going to be one — the rail is already the most crowded surface in the app. Every
`RunConfig` field (`chunkSize`, `cadenceBaseMs`, `cadenceJitterMs`,
`primerSettleMs`, `loadSettleMs`) is accepted by the `run.start` verb, so
"run it with a 30-second cadence and re-prime every 12" is something you ask the
chat for. The same goes for renaming a theme (`theme.rename`) and removing a
brand, project or template (`brand.delete`, `project.delete`, `template.delete`).

### Built but not yet proven

| Limit | Detail |
|---|---|
| **The chunk-boundary re-prime has never actually fired in a real run** | The only real run was 8 prompts and the boundary is 18, so the re-prime path has run in tests but never live. Your first run past 18 images is the first real test of it. |
| **Rate-limit and refusal detection** | The pause-on-limit path is written against the expected page markers but has never been triggered by a live rate limit. |
| **The v2 usability work (projects, run history, dial-in, run-entry choice)** | Built and unit-tested, awaiting an in-app acceptance pass. Expect rough edges. |

---

**Next:** the reasoning behind the whole design is in
[`imagedrip-plan.md`](imagedrip-plan.md); what's being built next, and the findings that
drove it, are in [`requirements-v2-usability.md`](requirements-v2-usability.md).

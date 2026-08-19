---
doc: runbook
project: imagedrip
status: READY TO EXECUTE — needs David at the screen (signed-in ChatGPT). Nothing here has been run.
created: 2026-08-19
purpose: make 0b-live and 0c executable in one sitting with no further design
pairs_with: README.md — the protocol and how to read the result. This file is the button-pressing.
---

# Runbook — 0b live probe + 0c drift experiment

**One sitting. Both need a signed-in ChatGPT, which is why neither was run for you.**

**Order matters and is not negotiable:** the live probe shares ImageDrip's ChatGPT session
partition (`persist:imagedrip-chatgpt`), so **ImageDrip must be quit while it runs**. Do 0b first
while the app is down, then bring the app up and leave it up for 0c.

| | What | Time | App state |
|---|---|---|---|
| **Step 1** | 0b — the live paste probe | ~10 min | **QUIT** |
| **Step 2** | 0c setup | ~5 min | running |
| **Step 3** | 0c arm 1 ×3 | ~2h of quota | running |
| **Step 4** | measure + record | ~10 min | either |
| **Step 5** | arms 2 and 3, *only if arm 1 fired* | ~2h | running |

**Record everything in `README.md` §Results.** The slots are already there and empty. A result that
lives only in your head is the failure this whole phase exists to prevent.

---

## Step 1 · 0b — does the real ChatGPT composer accept a pasted image?

**Quit ImageDrip first.** Two processes on one session partition is asking for trouble.

```bash
cd ~/dev/ad/apps/imagedrip
npm run dev:stop

npx electron probe/probe-attach-live.cjs \
  ~/Pictures/ImageDrip/12-days-of-claudmas/2026-08-07-2133-twelve-days-of-claudmas/day-03-second-brain.png
```

That image is a real 1.5 MB harvest, which is the point — the local probe already passed with a
generated 64×64 PNG and with a real harvest, and **what it could not test is ChatGPT.**

It pastes into your real account and **sends nothing** by default. Add `--submit` only when you want
to test question 3 below.

**Three questions, and the third is the one that bites:**

| # | Question | Why it matters |
|---|---|---|
| 1 | Does ChatGPT turn the pasted image into an attachment chip, or drop it? | If dropped, the reference-image path (R5) is dead in this form |
| 2 | Does `CHATGPT_SELECTORS.composerAttachment` **match** that chip? | The selector is marked ⚠️ UNVERIFIED — it was written for the *"Pasted text"* chip, never for an image |
| 3 | **After Enter, is the chip gone?** (run again with `--submit`) | `feed()`'s submit post-condition requires `!hasAttachment` **after** Enter. If a chip lingers or the selector over-matches, **every attached feed will report "Enter did not submit it" on a message that WAS sent** |

**Question 3 is an absence-looks-like-failure inversion** — the exact bug `feed()`'s verification was
written to end, reappearing through the attachment path. Do not skip the `--submit` arm.

**Record in `README.md` §Results → `0b`:**

```
- Live probe: ⬜ → ✅/❌ · chip appeared: __ · composerAttachment matched: __ · post-condition held: __
- If the selector missed, the re-pinned value: ______________________
- Decision it drives (2c small / 2c doubles): ______________________
```

**Stop condition.** If question 1 is NO, stop — do not run the `--submit` arm, and R5 needs a
different mechanism (CDP `DOM.setFileInputFiles`), which roughly doubles it.

---

## Step 2 · 0c setup — one project, one template, fixed for every arm

Bring the app up and leave it up:

```bash
cd ~/dev/ad/apps/imagedrip
npm run dev:clean
```

Then, in a second terminal, define the shell helper the rest of this file uses:

```bash
cd ~/dev/ad/apps/imagedrip
C="$HOME/Library/Application Support/imagedrip/control.json"
PORT=$(python3 -c "import json;print(json.load(open('$C'))['port'])")
TOK=$(python3 -c "import json;print(json.load(open('$C'))['token'])")
id(){ curl -s -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
      -X POST "http://127.0.0.1:$PORT/v1/call/$1" -d "${2:-\{\}}"; echo; }
```

Create the experiment's own project and template, so nothing existing is disturbed and every run
folder lands in one place:

```bash
id project.create  '{"name":"Drift 0c"}'
id template.create '{"name":"Drift 0c","importFormat":"lines"}'
id domain.import-prompts "$(python3 -c "
import json,io
lines=[l.strip() for l in io.open('docs/phase-0-checks/prompts-24-drift.txt',encoding='utf-8')]
lines=[l for l in lines if l and not l.startswith('#')]
assert len(lines)==24, len(lines)
print(json.dumps({'text':'\n'.join(lines),'mode':'replace','format':'lines'}))")"
```

**Confirm before you start feeding anything:**

```bash
id domain.get | python3 -c "
import sys,json; d=json.load(sys.stdin)['result']
print('project :',d['project']['id'])
print('template:',d['template']['id'],'| promptShape:',repr(d['template'].get('promptShape')))
print('brand   :',d['brand']['id'] if d.get('brand') else None)
print('queued  :',sum(1 for p in d['theme']['prompts'] if p['status']=='queued'),'of',len(d['theme']['prompts']))"
```

**Expect exactly:** `queued 24 of 24`, and **`promptShape: None`**.

> **Leave `promptShape` empty for every arm.** The shape is a *new* variable and this experiment is
> measuring drift, not the shape. Adding both at once means neither result is interpretable. The
> README says it in one line — *"leave the shape empty for the control, fill it for the comparison"* —
> and the comparison is a **later** sitting.

**Keep brand, template and project identical across all arms.** They are the controlled variables.

---

## Step 3 · Arm 1 — `chunkSize: 6`. Run this arm first, three times.

Arm 1 is the **only arm guaranteed to cross a boundary** (after images 6, 12 and 18). If the
re-prime is broken, you find out here, in the cheapest cell.

**Why this has never fired, mechanically:** the default `chunkSize` is **18**, the re-prime triggers
on `harvested % chunkSize === 0`, and **your longest run ever queued 15 prompts** — of which 9
harvested. The boundary has never been *reachable*. `reprimes: []` on all five manifests on disk is
not a bug report; it is a run that never got there.

### For each replicate (r1, r2, r3)

**Name the run before you start it** — `theme.rename` slugs into the run-id, so the folder tells you
which arm and replicate it was without opening the manifest:

```bash
id theme.rename '{"payload":"drift-a1-r1"}'      # then a1-r2, a1-r3
id domain.reset-run                               # re-queue all 24 (skip on the very first run)
```

**Then start the run. This is yours to press — an agent must not.**

- **In the app:** Auto mode → `▶ Run…`
- **Or from the terminal:** `id run.start '{"entry":"fresh","chunkSize":6}'`

`chunkSize` is already a `RunConfig` field, so **no code change is needed for any arm.**

> **`run.start` is confirm-first and engine-gated. It is on this page so you can drive it, and it is
> deliberately not something I ran.** Feeding the live session is the one thing this repo reserves
> for a human at the screen.

### While it runs

- A rate-limit pause is **data, not failure**. Record when it happened and let it resume.
- Do not switch project, brand or template mid-run — the run-state locks will refuse, and that
  refusal is correct.

### Stop condition — check this after the FIRST replicate, before running two more

```bash
id runs.list | python3 -c "
import sys,json
for r in json.load(sys.stdin)['result'][:3]: print(r)"
```

Then read that run's manifest:

```bash
id runs.manifest '{"payload":"<run-id-from-above>"}' | python3 -c "
import sys,json; m=json.load(sys.stdin)['result']
print('runId   :',m.get('runId'))
print('outcome :',m.get('outcome'))
print('reprimes:',m.get('reprimes'))
print('harvested:',sum(1 for p in m.get('prompts',[]) if p.get('outcome')=='harvested'),'of',len(m.get('prompts',[])))"
```

> ### 🔴 If `reprimes` is still `[]` after a completed 24-image run at `chunkSize: 6` — **STOP.**
> The re-prime did not fire. Do not run arms 2 or 3, and do not build the Segment model. The
> mechanism the whole drift plan and Phase 3 rest on does not work, and **that** is the finding —
> it is worth more than any drift number, and it is the cheapest possible way to learn it.

If `reprimes` is non-empty, run r2 and r3.

---

## Step 4 · Measure and record

```bash
npx electron probe/measure-drift.cjs ~/Pictures/ImageDrip/drift-0c/*
```

It reports **`D_prev`** (collapse) and **`D_first`** (wander) per image, marks the chunk boundaries
from each manifest's `reprimes`, and flags within-chunk trends and boundary jumps. Two metrics
because **one will not do** — collapse and wander have opposite signs, so a single "consistency
score" nets them to zero.

**Read it with README.md §0c → "Reading it".** Four signatures, four different strategies. The one
that appears decides whether re-priming *more often* helps or hurts — which are opposite answers to
the same question, and the reason this measurement outranks everything else on the list.

**Record in `README.md` §Results → `0c`:**

```
- Arm 1 (chunkSize 6): ⬜ → __ · reprimes non-empty: __ · runs completed: __
- Arm 2 (chunkSize 18): ⬜ → __
- Arm 3 (control):      ⬜ → __
- Signature observed: ______________________
- Decision it drives: ______________________
```

> **The metric is not your eye.** It has never been calibrated against a case you actually called
> drift. **If the numbers and the images disagree, the images win** — and say so in the record,
> because that is a finding about the metric.

---

## Step 5 · Arms 2 and 3 — only if arm 1 fired

Same loop, three replicates each, renaming as `drift-a2-r1` … `drift-a3-r3`:

| Arm | Command | Boundaries |
|---|---|---|
| **2** | `id run.start '{"entry":"fresh","chunkSize":18}'` | one, after 18 |
| **3** | `id run.start '{"entry":"fresh","chunkSize":24}'` | none — pure intra-conversation control |

**If quota forces a cut, run arm 1 three times before running arm 2 once.** Proving the re-prime
fires matters more than comparing arms.

---

## Afterwards — one line each

Both results feed rulings that are waiting on them, in `docs/rulings-open.md`:

- **0b** → **R5** (authorise the reference-image paste path)
- **0c** → **R4**, and it firms up **R1** (the Segment model rests on the re-prime working)

## What this runbook does NOT establish

- **Nothing about a *packaged* app.** Every command here runs against `npm run dev`.
- **Nothing about `promptShape`.** Deliberately held at empty; that comparison is a later sitting.
- **Nothing about cross-machine behaviour.** This is Roamy, with Roamy's ChatGPT session.
- **A rate-limit pause mid-arm changes the timing profile**, and the cadence and stall budget
  re-learn per run. A paused replicate is still usable for drift, but note it in the record.

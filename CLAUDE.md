# ImageDrip

## North Star

> **Fill in a few fields — or just say it in chat — and get images in that style generated on
> repeat, unattended, into a folder for that run. Drivable by a person or an agent.**

Interviewed from David and ratified 2026-08-08. The full document — the three axes
(brand / template / project), what ImageDrip is **not**, and the test that settles feature
arguments — is [docs/north-star.md](docs/north-star.md).

**The test, when a feature argument comes up:** *does it get more images of a given style out, with
less of the operator touching it?* If it adds a control to learn, it does not fit.

---

## The two things that break a fresh machine

- **npm only.** `packageManager` is pinned to `npm@11.11.0`. **pnpm 10+ blocks postinstall, and
  Electron's postinstall is what downloads the Electron binary** — `pnpm install` yields a package
  with no Electron in it, and it fails later and confusingly.
  See `docs/kdd/learnings/blocked-postinstall-leaves-a-hollow-package.md`.
- **`@appydave/core` is a local path dependency**, not published to npm.
  `~/dev/ad/apps/appydave-foundation/` must exist as a sibling of this repo or `npm install` fails
  outright.

## Running it

`npm run dev`. **The ChatGPT panel must be signed in by hand, once per machine** — no agent can do
this, and it is a precondition for anything touching `run.*`. A machine that has not done it can
still exercise every config verb; it cannot run a batch.

`npm run dev` against an already-running app does **not** replace it — ImageDrip takes a
single-instance lock, so the new instance surrenders and focuses the old window. The failure is
silent: the app comes to the front, looks fine, and serves a build you stopped editing an hour ago.
Use **`npm run dev:clean`** (stop, then start).

## The standard this repo holds itself to

**Nothing may fail silently.** Its own hardest-won rule, from the `feed()` fix: *"a control that
quietly disappears is worse than none, because it is believed."* A run that did not deliver must
never look like one that did.

`repo.attach` is **knowingly defective** — it publishes every unsourced project and template into
whichever repo you point at, stamped with the active brand. Do not un-gate it.

**But "gated" means less than it sounds, and the difference matters.** The confirm is raised for the
**in-app chat pane only** (`src/main/capability-guard.ts:217`). There it is a *prompt* for the eight
gated verbs, and a *hard denial* for `repo.attach` alone — the one verb a yes/no confirm cannot
describe honestly. A human clicking in the UI meets no confirm (they have already confirmed) but
still meets the engine precondition, which applies to every principal. And **every other agent
client — a terminal Claude Code session through `.mcp.json`, Codex through `.codex/config.toml`, or
plain `curl` — gets no confirmation at all.** Past the loopback bearer token, the only thing in the
way of `repo.attach` is a CONFIRM-FIRST banner in the tool description, which is advisory text.
`run.start` and `run.resume` additionally require a signed-in engine, for every caller.

**A second gap, and it is the sharper one:** the three destructive verbs are reachable by an agent
and by nobody at the window. Stated once, below, under "What is open" — item 2.

## What is open, as of 2026-08-29

**Read this before proposing work.** A three-part audit ran on 2026-08-29 and its findings are in
`docs/audit-2026-08-29-*.md`; the open decisions are consolidated in `docs/rulings-open.md`, which is
the one list. Four things are outstanding, in the order they are worth doing.

**1 · `submit()` uses a mechanism this repo already disproved.** `webview-harness.ts:486` fires a
synthesized Return, and `paste()` twenty lines above it (`:471`) carries a VERIFIED probe result
saying a synthesized key is **a no-op into this composer**. `paste()` was fixed to use the real
editing command; `submit()` was not. **This accounts for 6 of the 12 pauses ever recorded.** Cheapest
high-value work in the repo, needs no ruling, and it changes what the provider decision is about.
→ `docs/spec-submit-uses-a-mechanism-the-repo-disproved.md`. **Diagnosis, not a reproduction — nobody
has run a fix.**

**2 · Three destructive verbs are agent-only.** `brand.delete`, `template.delete`, `project.delete`
and `theme.rename` have **no preload bridge** — there is no delete affordance anywhere in the UI. A
terminal agent or `curl` can delete a project *and its entire prompt queue* with no confirmation and
no undo; the person at the window cannot delete it at all. That inverts the parity rule David ruled
on 2026-08-10, and no document records it as deliberate. → `rulings-open.md` **R18**, audit DD-017.

**3 · The engine decision.** Whether to retire the embedded ChatGPT panel for a hosted image API.
Evidence, blast radius, seam and staged plan in
`docs/audit-2026-08-29-provider-decision-brief.md`. **Do not start deprecation work — it is unruled.**
Note §4.2a: kie.ai is 8× the price of an `OPENAI_API_KEY` David already holds, and local generation
on the Mac fleet is the only option that keeps the Star's "costs nothing per image" literally true.

**4 · The style axis.** `Brand` is carrying two different things — identity (`beauty-joy`, `appydave`)
and visual style (`agent-office-retro-pixel`). Six styles over one identity means six fake brands
today. → `docs/research-2026-08-29-brand-family-and-characters.md` §6, and the axes artefact.
**Do not codify the domain model in Zod until this is ruled** — it would freeze a known hole.

**Ruled and closed on 2026-08-29, so do not reopen:** parity wins when a control performs a step the
app already performs (now in `docs/north-star.md`) · animation is not an axis, `Template` absorbs it ·
do not adopt Storyline's shape, though consuming its prompt output is a real seam · no `Character`
record — prose in `Project.body` covers it · no renames of `VIDEO.md` / `VERBAL-STYLE.md`.

**One standing caution the audit earned:** every `status:` field in `docs/` is a promise that rots.
Two specs shipped on 2026-08-29 still saying *"Nothing built"* about code in their own commit. Trust
`git log` over a frontmatter line.

---

`git log` carries the reasoning, not just the change.

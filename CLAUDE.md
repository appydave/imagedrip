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

`repo.attach` is **knowingly defective and gated** — it publishes every unsourced project and
template into whichever repo you point at, stamped with the active brand. Do not un-gate it.

`git log` carries the reasoning, not just the change.

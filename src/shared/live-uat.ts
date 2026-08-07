/**
 * Live UAT — the judgment-capture sidecar (`docs/live-uat.md`).
 *
 * Two records, deliberately kept in TWO stores:
 *
 *   Snag         anchored to a SCREEN REGION  → the cockpit backlog (WP6/WP7)
 *   ImageVerdict anchored to a RUN + PROMPT   → the primer-tuning corpus
 *
 * Merging a screen anchor with a data anchor destroys the cross-record
 * correlation ("this primer keeps producing washed-out backgrounds") that is the
 * entire point of the tuning loop. Share the control; split the store.
 *
 * Nothing here touches `domain.json` or the run manifests. Delete the whole
 * `live-uat/` directory and ImageDrip behaves exactly as before.
 */

/**
 * 👎 wrong/missing · ❓ don't-get-it · 👍 confirmed good · 💡 a wish, not a defect.
 *
 * `question` is not decoration: its fix is usually to RENDER where a value comes
 * from, not to change the value. No star rating — prose beats scalars.
 */
export type Verdict = 'down' | 'question' | 'up' | 'idea';

/**
 * One piece of cockpit friction, anchored to a screen region.
 *
 * `region` is a PLAIN STRING, never a union — so a new surface becomes flaggable
 * by passing a name, and a synthetic key (`config:cadenceBaseMs`) can carry a
 * judgment about a value that has no control behind it at all. Those are exactly
 * the values most likely to be wrong (see the gap map in `docs/live-uat.md`).
 */
export interface Snag {
  id: string;
  region: string;
  verdict: Verdict;
  /** Free text. THE highest-value field — the composer autofocuses it. */
  note: string;
  /** Caller-composed at the call site, so the flag stays legible later. */
  snapshot: string;
  mode: 'dial-in' | 'auto';
  /** `RunStatus.phase` at flag time — friction is often phase-specific. */
  phase: string;
  projectId: string;
  status: 'open';
  createdAt: number;
}

/**
 * What actually produced an image. Resolved in MAIN from the run manifest — the
 * renderer never supplies it.
 *
 * Without the primer, an image judgment is a bug report. With it, the corpus is
 * a tuning signal that can be traced back to a cause.
 */
export interface ImageProducer {
  /** The EXACT primer text as posted for that run. */
  primer: string;
  promptText: string;
  entry?: 'continue' | 'fresh';
  mode?: 'auto' | 'dial-in';
  /** Null when the image was made with no brand selected — a real producer state. */
  brandId: string | null;
  projectId: string;
  generationMs?: number;
}

/** A judgment on one harvested image, anchored to the app's real run keys. */
export interface ImageVerdict {
  id: string;
  runId: string;
  promptId: string;
  /** Harvested filename, relative to the run folder. */
  file?: string;
  verdict: Verdict;
  note: string;
  producer: ImageProducer;
  status: 'open';
  createdAt: number;
}

/** What the renderer sends to raise a snag. Main assigns id/status/createdAt. */
export interface SnagInput {
  region: string;
  verdict: Verdict;
  note: string;
  snapshot: string;
  mode: 'dial-in' | 'auto';
  phase: string;
}

/**
 * What the renderer sends to judge images. `savedPath` is the harvest-root
 * relative path (`<runId>/<file>`); main splits it and reads that run's
 * manifest for the producer snapshot.
 *
 * `items` is a LIST because a run is ~18 images and one verdict routinely
 * applies to a whole batch of them — the granular→compound steering tool.
 */
export interface VerdictInput {
  items: { promptId: string; savedPath: string; subject: string }[];
  verdict: Verdict;
  note: string;
}

/** Badge counts — proof the capture landed, without building an inbox. */
export interface UatCounts {
  snags: number;
  verdicts: number;
}

/**
 * Is the Live UAT gate on? (A4 — the default flipped to ON.)
 *
 * It shipped OFF, on the reasoning that a capture tool should never nag. The
 * evidence says the reasoning was wrong: `live-uat/` did not exist at all as of
 * 2026-08-07 — ZERO snags and ZERO verdicts since the feature was built on
 * 2026-08-03. A capture surface nobody switches on captures nothing, and the ⚑
 * is a small inert glyph until it is clicked, so "on" costs a little ink and
 * "off" cost the entire corpus.
 *
 * An EXPLICIT off still wins. Someone who turned it off made a decision, and
 * silently re-enabling it on the next launch would be the nag this was trying
 * not to be. Only the ABSENT preference changes meaning.
 */
export function uatEnabled(stored: string | null): boolean {
  return stored !== 'off';
}

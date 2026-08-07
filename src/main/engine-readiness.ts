/**
 * `engine.readiness` — is the image engine actually able to accept a prompt?
 *
 * The ChatGPT sign-in is the one manual precondition in the whole system (v4 §0
 * step 4): a human opens the app on this machine and logs in by hand, once, and
 * the session persists on local disk. It does not travel with the repo.
 *
 * A human never needed this check. They run `npm run dev`, see a login wall in
 * the right-hand pane, and know. **The v4 control surface removed that feedback
 * loop** — `imagedrip-mcp.mjs`, `chat-probe.mjs` and `claude-cli.mjs` all invoke
 * run verbs with nobody looking at the window, so the precondition became
 * invisible at exactly the moment it matters.
 *
 * What it costs to skip this check is not a clean failure. `WebviewHarness.feed`
 * locates the composer, and when it cannot find one it logs a warning and
 * **proceeds anyway** — `selectAll()` + `paste()` + Return into whatever happens
 * to hold focus. On a signed-out page that is the login form. So an unguarded
 * `run.start` types prompt text into an email field, submits it, and then stalls
 * waiting for an image, once per queued prompt at human cadence.
 *
 * Pure by the same argument as `context-snapshot.ts` — no Electron, no DOM, no
 * clock of its own. The caller supplies the probe; this file only decides what
 * the probe MEANS. That is what makes all three verdicts testable without a
 * signed-in browser, which matters because CI never has one.
 *
 * The degradation convention is `context.get`'s, deliberately: never throw,
 * return a structured negative carrying an actionable `hint`. An error tells a
 * caller something broke and invites a retry; a hint tells it what the human
 * must do, which is the only thing that can actually resolve a missing login.
 */

import type { EngineProbeReport } from '@shared/ipc';

/**
 * What the preload reports about the live page. Read-only DOM observation — it
 * sends nothing to the engine, which is the point: readiness must be knowable
 * WITHOUT burning a prompt to find out. The shape lives in `@shared/ipc` with
 * the channel that carries it, so preload and main cannot drift.
 */
export type EngineProbe = EngineProbeReport;

export type EngineState =
  /** Composer present — a prompt can be fed. */
  | 'ready'
  /** Page loaded, no composer, login affordance visible — the human must sign in. */
  | 'signed-out'
  /** No ChatGPT view at all: the app is not open, or the pane was never attached. */
  | 'detached'
  /** Probe timed out, page still loading, or the selectors no longer match. */
  | 'indeterminate';

export interface EngineReadiness {
  /** True ONLY for 'ready'. Every other state must block a run. */
  ready: boolean;
  state: EngineState;
  /** Absent when ready; otherwise what the human must do, in words worth relaying verbatim. */
  hint?: string;
  /** ISO timestamp of the probe this verdict came from, or of the attempt if it failed. */
  checkedAt: string;
}

/**
 * The manual fix, named explicitly. An agent relays this to the user, so it has
 * to say WHERE (this machine), WHAT (the right-hand pane) and HOW OFTEN (once) —
 * a hint that only says "not signed in" sends the user looking in the wrong place.
 */
export const SIGNED_OUT_HINT =
  'The embedded ChatGPT engine is not signed in on this machine, so a run would type prompts into the login form instead of the composer. A human must do this by hand, once: open ImageDrip on this machine (npm run dev) and sign in to ChatGPT in the right-hand pane. The session then persists across restarts. No agent can perform this step.';

export const DETACHED_HINT =
  'The ChatGPT engine pane is not attached, so there is nothing to feed. Ask the user to open ImageDrip on this machine (npm run dev) and leave the window open; the engine pane attaches when the cockpit loads.';

export const INDETERMINATE_HINT =
  'The ChatGPT engine did not answer the readiness probe, so it is not safe to start a run — it may be mid-load, signed out, or the composer selector may have drifted. Ask the user to open ImageDrip on this machine, confirm the right-hand pane shows a signed-in ChatGPT with a usable message box, and try again.';

export interface BuildEngineReadinessInput {
  /** Injected so `checkedAt` is deterministic in tests rather than assumed. */
  now: number;
  /** Is a ChatGPT `WebContentsView` attached at all? */
  attached: boolean;
  /** The probe result, or null when it timed out or could not be sent. */
  probe: EngineProbe | null;
}

export function buildEngineReadiness(input: BuildEngineReadinessInput): EngineReadiness {
  const checkedAt = new Date(input.probe?.at ?? input.now).toISOString();

  // No view: distinct from signed-out, and the fix is different (open the app,
  // rather than log in). Collapsing the two sends the user to the wrong place.
  if (!input.attached) {
    return { ready: false, state: 'detached', hint: DETACHED_HINT, checkedAt };
  }

  // A silent probe is NOT an implicit yes. This is the case that decides whether
  // the whole guard is worth having: defaulting to ready here would restore the
  // exact bug — a run starting against an engine nobody has confirmed.
  if (!input.probe) {
    return { ready: false, state: 'indeterminate', hint: INDETERMINATE_HINT, checkedAt };
  }

  // The composer is the only affirmative signal. Its presence means the page is
  // in the state where `feed` types into the message box and nowhere else.
  if (input.probe.composer) {
    return { ready: true, state: 'ready', checkedAt };
  }

  // No composer, and the page says why: a login wall, by affordance or by URL.
  const authUrl = input.probe.url.includes('/auth/');
  if (input.probe.loginAffordance || authUrl) {
    return { ready: false, state: 'signed-out', hint: SIGNED_OUT_HINT, checkedAt };
  }

  // No composer, no login tell. Either the page is still loading, or the
  // selectors have drifted (re-pinning is expected maintenance, per §4 of
  // `chatgpt-selectors.ts`). Both are indeterminate, and both must block a run:
  // guessing "probably fine" is what types into the login form.
  return { ready: false, state: 'indeterminate', hint: INDETERMINATE_HINT, checkedAt };
}

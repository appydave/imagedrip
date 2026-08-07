/**
 * `context.get` — the one genuinely new handler in v4 (§9.3).
 *
 * Everything else on the control surface mirrors a channel that already exists.
 * This one answers the question an agent must ask before it can act: *what is
 * ImageDrip currently pointed at?* It is what makes "add twelve more like the
 * last lot" resolvable at all.
 *
 * Two rules, both load-bearing:
 *
 *  1. **It expires.** ~5 minutes after the last human interaction the answer is
 *     no longer trustworthy — without expiry an agent silently targets whatever
 *     was last clicked before lunch, and every subsequent write lands on the
 *     wrong project with total confidence.
 *
 *  2. **Stale is not an error.** A stale read returns `{active:false, hint}`
 *     with 200. An error tells the agent something broke and invites a retry;
 *     a hint tells it what the human must do, which is the only thing that can
 *     actually resolve the situation.
 *
 * Pure — no Electron, no store, no clock of its own. The caller supplies `now`,
 * which is what makes expiry testable rather than assumed.
 */

import type { DomainState } from '@shared/domain';
import type { EngineReadiness } from './engine-readiness.js';

/** ~5 minutes of no human interaction and the answer stops being trustworthy. */
export const CONTEXT_TTL_MS = 5 * 60 * 1000;

/** How the app is being driven — v4 §9.3 names these two, not the store's 'auto'. */
export type ContextMode = 'dial-in' | 'automation';

export interface ActiveContext {
  active: true;
  /** Null when the user has selected "(none)" — the primer carries no house style. */
  brand: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  project: { id: string; name: string; outputDir: string | null };
  mode: ContextMode;
  run: { status: string; queued: number; harvested: number } | null;
  /** ISO — when this snapshot stops being trustworthy. */
  expiresAt: string;
  /**
   * Can the image engine actually accept a prompt right now?
   *
   * Present on BOTH branches, and that is the point: an operator chat asking
   * for the state of the app must learn the engine is unusable BEFORE it
   * promises the user a batch. Discovering it at `run.start` is already too
   * late — by then the promise has been made.
   */
  engine: EngineReadiness;
}

export interface StaleContext {
  active: false;
  hint: string;
  /** Reported even when the selection is stale — the two are independent problems. */
  engine: EngineReadiness;
}

export type ContextResult = ActiveContext | StaleContext;

export interface BuildContextInput {
  /** Injected so expiry is testable rather than assumed. */
  now: number;
  /** Epoch ms of the last real human interaction with the window; 0 = never. */
  lastInteractionAt: number;
  /** The live domain document. */
  domain: DomainState;
  /** The mode the last run record was opened in, if any. */
  mode: ContextMode;
  /** The phase of the most recent run status this launch, or null if no run has happened. */
  runPhase: string | null;
  /** The engine verdict from `buildEngineReadiness` — passed in, never derived here. */
  engine: EngineReadiness;
  ttlMs?: number;
}

export const STALE_HINT =
  'ImageDrip has not been touched for a while, so the active project may not be what you expect. Ask the user to open ImageDrip and select the brand, template and project they want, then call context.get again.';

export function buildContext(input: BuildContextInput): ContextResult {
  const ttl = input.ttlMs ?? CONTEXT_TTL_MS;
  const expiresAt = input.lastInteractionAt + ttl;

  // `lastInteractionAt === 0` means nobody has touched the window since launch.
  // That is stale by the same argument: there is no evidence the selection on
  // screen is the selection the user means.
  if (!input.lastInteractionAt || input.now >= expiresAt) {
    return { active: false, hint: STALE_HINT, engine: input.engine };
  }

  const { domain } = input;
  const prompts = domain.theme?.prompts ?? [];

  return {
    active: true,
    brand: domain.brand ? { id: domain.brand.id, name: domain.brand.name } : null,
    template: domain.template ? { id: domain.template.id, name: domain.template.name } : null,
    project: {
      id: domain.project.id,
      name: domain.project.name,
      outputDir: domain.project.outputDir ?? null,
    },
    mode: input.mode,
    run:
      input.runPhase === null
        ? null
        : {
            status: input.runPhase,
            queued: prompts.filter((p) => p.status === 'queued').length,
            harvested: prompts.filter((p) => p.status === 'harvested').length,
          },
    expiresAt: new Date(expiresAt).toISOString(),
    engine: input.engine,
  };
}

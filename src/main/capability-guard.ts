/**
 * The capability guard — authorization, beneath every adapter.
 *
 * ── Why this file exists ──
 *
 * Until 2026-08-11 three checks lived INSIDE `control-surface.ts`: the engine
 * precondition, the D1 human gate, and the pane deny-list. That is the
 * "WRONG" diagram in `agent-first-architecture/agent-safety.md` §2, drawn from
 * life:
 *
 *     agent ──► HTTP adapter ──► core          renderer ──────────► core
 *                 [authz here]                        (different rules, or none)
 *
 * It passed the test the brain actually poses — *delete the MCP server, is it
 * still protected?* Yes, because `imagedrip-mcp.mjs` holds no logic. But it
 * failed the harder one: **delete `control-surface.ts` and every check goes
 * with it.** Sound only while exactly one non-UI adapter exists, and silently
 * broken at the second.
 *
 * It also had a live consequence, not just a latent one. A human clicking
 * `▶ Run theme…` never met the engine gate at all — the renderer path went
 * straight to the handler. Against a signed-out ChatGPT the run started and
 * discovered the problem downstream, where `WebviewHarness.feed` pastes into
 * whatever holds focus, which on a signed-out page is the login form.
 *
 * So the checks move here, and both adapters call in:
 *
 *     renderer  ─┐
 *     HTTP/MCP  ─┼──►  authorize(principal, capability, input)  ──►  handler
 *     future CLI─┘
 *
 * ── What is deliberately principal-dependent ──
 *
 * One gate, one place, different answers per caller. That is the point: the
 * policy is declared once instead of being re-implemented per adapter.
 *
 *   exposure        agents only.  A human may drive `harness.feed`; that is
 *                   what Dial-in IS. `NEVER_EXPOSED` is about who may reach a
 *                   capability from outside, not about whether it is safe.
 *   engine-ready    EVERY principal. A run against a signed-out engine is the
 *                   same mistake whoever makes it, and the hint is the same.
 *   pane-deny       the pane agent only.
 *   confirmation    agents only — and this is not an oversight. A human
 *                   clicking `▶ Run theme…` HAS confirmed; asking them to
 *                   confirm their own click is a control to learn, which the
 *                   North Star rules out. The gate exists because an agent's
 *                   intent to call is not a human's decision to allow.
 */

import type { Logger } from '@appydave/core';
import type { EngineReadiness } from './engine-readiness.js';
import {
  describeVerb,
  isExposed,
  isGated,
  isPaneDenied,
  requiresEngine,
  toVerb,
} from './verb-policy.js';

/**
 * Who is asking. `principal` is an ARGUMENT, per agent-safety.md §2 — the shape
 * of the check is *can THIS principal perform THIS capability under THESE
 * conditions*, and that question cannot be asked without naming the caller.
 */
export type Principal =
  /** A person at the window. The renderer. */
  | { kind: 'human' }
  /** The contained CLI behind the Chat tab (D2: Read + MCP, no Bash/Write/Edit). */
  | { kind: 'pane-agent' }
  /** Any other control-surface client — a terminal session, curl, chat:probe. */
  | { kind: 'api-agent' };

export function principalLabel(p: Principal): string {
  return p.kind;
}

/** One capability call, as the guard sees it. */
export interface CapabilityCall {
  /** The IPC channel — the capability's real identity. */
  channel: string;
  /** Dot-form verb, or null for a channel outside the ImageDrip namespace. */
  verb: string | null;
  /** The payload, ALREADY schema-validated. Order matters — see §refusals. */
  input: unknown;
  principal: Principal;
}

export type RefusalCode =
  | 'not_exposed'
  | 'engine_not_ready'
  | 'forbidden_for_pane'
  | 'confirm_denied';

/**
 * A refusal the guard raises. It carries an HTTP status so the control surface
 * can map it without re-deciding anything — the adapter translates, it does not
 * judge. An adapter that had to choose the code would be holding policy again.
 */
export class CapabilityRefusal extends Error {
  readonly code: RefusalCode;
  readonly status: number;
  readonly detail: Record<string, unknown>;

  constructor(code: RefusalCode, status: number, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CapabilityRefusal';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Used when no readiness probe is wired at all. It still refuses: an unchecked
 * engine and a broken engine are indistinguishable from here, and only one of
 * those two guesses can type prompts into a login form.
 */
export const UNKNOWN_ENGINE_MESSAGE =
  'The ChatGPT engine could not be checked from this process, so a run is refused rather than started blind. Ask the user to open ImageDrip on this machine and confirm the right-hand pane shows a signed-in ChatGPT.';

export interface CapabilityGuardDeps {
  /**
   * Can the ChatGPT engine accept a prompt? Optional so the guard stays
   * constructible in tests and in any host with no webview — but when omitted
   * the engine is treated as UNKNOWN and engine-requiring verbs are refused,
   * never waved through. A missing check is not evidence of a working engine.
   */
  engineReadiness?: () => Promise<EngineReadiness>;
  /**
   * Put a gated call in front of a human (D1). Resolves true only on an
   * explicit allow. Omitted means no reachable human, which is a DENY — absent
   * consent is not consent.
   */
  confirmGated?: (call: { verb: string; payload: unknown; description: string }) => Promise<boolean>;
  logger?: Logger;
}

export interface CapabilityGuard {
  /** Throws `CapabilityRefusal` if this principal may not proceed. */
  authorize(call: CapabilityCall): Promise<void>;
  /** Record that a capability ran. Audit is a Track C duty, not a nicety. */
  audit(call: CapabilityCall, outcome: 'ok' | 'refused', detail?: Record<string, unknown>): void;
}

export function createCapabilityGuard(deps: CapabilityGuardDeps): CapabilityGuard {
  return {
    async authorize(call: CapabilityCall): Promise<void> {
      const { principal, channel } = call;
      const verb = call.verb ?? toVerb(channel);
      const isAgent = principal.kind !== 'human';

      // ── 1 · Exposure — agents only ──
      // A human reaching `harness.feed` from the renderer is Dial-in working as
      // designed. The same call from outside the window is the second writer
      // that voids the ToS mitigation.
      if (isAgent && !isExposed(channel)) {
        throw new CapabilityRefusal(
          'not_exposed',
          404,
          `unknown verb: ${verb ?? channel}`,
          { verb: verb ?? channel },
        );
      }

      if (!verb) return; // scaffold channels (`app:*`, `counter:*`) carry no policy

      // ── 2 · The engine precondition — EVERY principal ──
      // This is the check that used to skip the human path entirely. A run
      // against a signed-out engine fails the same way whoever starts it, and
      // failing here is far better than failing inside `feed`.
      if (requiresEngine(verb)) {
        const readiness = await deps.engineReadiness?.();
        if (!readiness?.ready) {
          const message = readiness?.hint ?? UNKNOWN_ENGINE_MESSAGE;
          deps.logger?.info(
            { verb, principal: principal.kind, state: readiness?.state ?? 'unknown' },
            'refused: engine not ready',
          );
          throw new CapabilityRefusal('engine_not_ready', 409, message, {
            verb,
            engine: readiness ?? { ready: false, state: 'indeterminate', hint: message },
          });
        }
      }

      // Everything below is about an AGENT's intent to call. A human has
      // already decided by clicking.
      if (!isAgent) return;
      if (!isGated(verb)) return;

      // ── 3 · Denied outright to the pane ──
      // Not "ask the human": a yes/no confirm cannot honestly describe what
      // `repo.attach` would do, so a yes would not be informed consent.
      if (principal.kind === 'pane-agent' && isPaneDenied(verb)) {
        deps.logger?.warn({ verb }, 'refused: verb is denied to the pane');
        throw new CapabilityRefusal(
          'forbidden_for_pane',
          403,
          `${verb} cannot be called from the in-app chat, with or without approval. ` +
            'It carries a known defect that a yes/no confirm cannot describe honestly. ' +
            'Tell the user it must be done by hand, and why.',
          { verb },
        );
      }

      // ── 4 · The D1 human gate — the pane only ──
      // Other agents keep advisory behaviour, which is what leaves
      // `chat:probe` headless and leaves a terminal session unblocked. There is
      // no human sitting at those to answer a dialog.
      if (principal.kind !== 'pane-agent') return;

      let allowed = false;
      try {
        allowed = deps.confirmGated
          ? await deps.confirmGated({ verb, payload: call.input, description: describeVerb(verb) })
          : false;
      } catch (err) {
        // A confirm that THREW told us nothing about what the human wants.
        allowed = false;
        deps.logger?.warn(
          { verb, err: err instanceof Error ? err.message : String(err) },
          'gate confirm failed — denying',
        );
      }

      if (!allowed) {
        deps.logger?.info({ verb }, 'refused: human declined the gated verb');
        throw new CapabilityRefusal(
          'confirm_denied',
          403,
          `The user did not approve ${verb}. This is a final answer, not a transient ` +
            'failure — do NOT retry it and do not look for another way to achieve it. ' +
            'Tell them it was declined and ask what they want instead.',
          { verb },
        );
      }
      deps.logger?.info({ verb }, 'gated verb approved by the human');
    },

    audit(call, outcome, detail = {}): void {
      const verb = call.verb ?? toVerb(call.channel) ?? call.channel;
      // Only mutations are worth a line; a read-heavy agent would otherwise
      // bury the record that matters. `isGated` is a rough proxy for "changes
      // something a human would want to see afterwards" until the contracts
      // carry an explicit `sideEffects` field.
      if (outcome === 'ok' && !isGated(verb)) return;
      deps.logger?.info(
        { verb, principal: call.principal.kind, outcome, ...detail },
        'capability',
      );
    },
  };
}

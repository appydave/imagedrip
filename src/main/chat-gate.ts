/**
 * The human gate (v4 WP4, D1 — decided 2026-08-08).
 *
 * `gated: true` on a published verb is METADATA. It travels to the model in the
 * tool description and asks it nicely not to call the verb without permission —
 * and **a gate the model can decline to honour is not a gate.** AC-5 requires
 * that *"Start the run must ask before feeding the live session, every time"*,
 * and until this file existed the only thing making that true was the model
 * choosing to obey a sentence.
 *
 * This holds the call instead. One gated verb from the pane, one question in
 * front of a person, one answer.
 *
 * ── Three properties, each of which is the whole point ──
 *
 * 1. **It DENIES on expiry.** Never allows. A confirm that defaults open under
 *    load, or when the user has walked away, is worse than no confirm: it
 *    produces a record of consent that nobody gave. The timeout exists so a
 *    held call cannot wedge the chat forever, not to eventually say yes.
 *
 * 2. **No answer channel means no.** If the window is gone, or the renderer
 *    never subscribed, there is no human to ask — and absent consent is not
 *    consent. The pane's entire premise is that somebody is sitting there.
 *
 * 3. **One question at a time.** A second gated call while one is pending is
 *    denied outright rather than queued behind it. Two dialogs racing is how a
 *    person clicks Allow on the one they read and grants the one they did not.
 *
 * Note what is NOT here: any notion of "remember this choice" or a grant that
 * covers later calls. AC-5 says *every time*. It is affordable precisely
 * because the gated verbs are coarse — `run.start` runs the whole queue, so a
 * twelve-image batch costs ONE confirm, not twelve.
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from '@appydave/core';
import type { ChatGateRequest } from '../shared/chat.js';
import type { GatedCall } from './control-surface.js';

/**
 * Long enough to read a dialog and think; short enough that a forgotten one
 * does not leave the agent hanging for an entire session. It is a backstop —
 * the expected path is that a person answers.
 */
export const GATE_TIMEOUT_MS = 120_000;

export interface ChatGateOptions {
  /**
   * Put the question in front of the human. Returns false when there was
   * nowhere to put it — no window, no subscriber — which is a DENY.
   */
  present: (request: ChatGateRequest) => boolean;
  /** Tell the UI the question is over (answered, expired, or abandoned). */
  dismiss: (id: string) => void;
  timeoutMs?: number;
  logger?: Logger;
}

export interface ChatGate {
  /** Hold one gated call until a human answers, or until it expires. */
  ask(call: GatedCall): Promise<boolean>;
  /** The renderer's answer. Ignored unless it names the pending request. */
  decide(id: string, allow: boolean): void;
  /** Deny anything pending — teardown, or the chat session going away. */
  cancelAll(reason: string): void;
  /** The question currently in front of the human, if any. */
  pending(): ChatGateRequest | null;
}

/**
 * A first line a human can act on, without needing to know the verb table.
 *
 * The verb's own `description` is written for an AGENT deciding its next move
 * and is far too long to put in a dialog, so the consequence is stated here in
 * one sentence. Where the payload carries the blast radius, it is named — "the
 * whole queue" is the difference between an informed yes and a reflex one.
 */
export function summarise(call: GatedCall): string {
  switch (call.verb) {
    case 'run.start':
      return 'The chat wants to START A RUN — feeding prompts into your live, logged-in ChatGPT session, one at a time, until the queue is empty.';
    case 'run.stop':
      return 'The chat wants to STOP the run that is in flight. Images already harvested are kept.';
    case 'run.pause':
      return 'The chat wants to PAUSE the run that is in flight.';
    case 'run.resume':
      return 'The chat wants to RESUME the paused run and carry on feeding the live session.';
    case 'domain.reset-run':
      return 'The chat wants to RE-QUEUE every prompt in this theme so it can all run again. Harvested images stay on disk; the queue is rewritten.';
    case 'project.choose-output-dir':
      return 'The chat wants to open a folder picker so you can choose where images land.';
    case 'brand.delete':
      return 'The chat wants to DELETE a brand. Nothing is removed from disk, but there is no undo inside the app.';
    case 'template.delete':
      return 'The chat wants to DELETE a template. Nothing is removed from disk, but there is no undo inside the app.';
    case 'project.delete':
      return 'The chat wants to DELETE a project AND its whole prompt queue. Harvested images and run folders stay on disk; the queue does not.';
    default:
      return `The chat wants to call ${call.verb}, which is marked confirm-first.`;
  }
}

export function createChatGate(options: ChatGateOptions): ChatGate {
  const timeoutMs = options.timeoutMs ?? GATE_TIMEOUT_MS;

  interface Held {
    request: ChatGateRequest;
    settle: (allow: boolean) => void;
    timer: NodeJS.Timeout;
  }
  let held: Held | null = null;

  /** Resolve the pending question exactly once and clean up after it. */
  function close(allow: boolean, why: string): void {
    const current = held;
    if (!current) return;
    held = null;
    clearTimeout(current.timer);
    options.dismiss(current.request.id);
    options.logger?.info(
      { verb: current.request.verb, allow, why },
      allow ? 'gate: allowed by the human' : 'gate: denied',
    );
    current.settle(allow);
  }

  return {
    pending: () => held?.request ?? null,

    ask(call: GatedCall): Promise<boolean> {
      // Property 3: never two questions at once.
      if (held) {
        options.logger?.warn(
          { verb: call.verb, pending: held.request.verb },
          'gate: denied — another confirm is already in front of the user',
        );
        return Promise.resolve(false);
      }

      const request: ChatGateRequest = {
        id: randomUUID(),
        verb: call.verb,
        summary: summarise(call),
        payload: call.payload,
        expiresAt: Date.now() + timeoutMs,
      };

      // Property 2: if it cannot be shown, it is denied. Ask BEFORE arming the
      // timer, so an unshowable question fails immediately rather than making
      // the agent wait two minutes to be told nobody was home.
      if (!options.present(request)) {
        options.logger?.warn({ verb: call.verb }, 'gate: denied — no window to ask in');
        return Promise.resolve(false);
      }

      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => close(false, 'timed out'), timeoutMs);
        // A pending confirm must never be the reason the app will not quit.
        timer.unref?.();
        held = { request, settle: resolve, timer };
      });
    },

    decide(id: string, allow: boolean): void {
      // The id match is not ceremony: a stale click on a dialog that already
      // expired must not answer whatever question came after it.
      if (!held || held.request.id !== id) {
        options.logger?.info({ id }, 'gate: ignoring an answer to a question that is no longer open');
        return;
      }
      close(allow, 'answered');
    },

    cancelAll(reason: string): void {
      close(false, reason);
    },
  };
}

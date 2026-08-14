/**
 * The operator chat's wire types (v4 WP4).
 *
 * Shared because the SAME six events are produced in main (by the stream
 * parser, from the CLI's stdout) and rendered in the renderer. Declaring them
 * here rather than in `src/main` is what lets `IPC.chatEvent` be typed on both
 * sides of the bridge from one definition — the same argument that puts
 * `HarnessEvent` and `RunStatus` in `@shared/ipc`.
 *
 * `src/main/claude-stream.ts` imports these as `import type`, which matters:
 * that import is ERASED at runtime, so `scripts/chat-probe.mjs` can load the
 * parser under bare Node without ever resolving the `@shared` alias.
 */

/** Lifecycle. The CLI's own account of what it is doing, preferred over anything inferred. */
export interface ChatStatusEvent {
  type: 'status';
  /** `initializing` / `requesting` / `thinking` / `done` / `error`, and whatever else the CLI emits. */
  status: string;
}

export interface ChatTextDeltaEvent {
  type: 'text_delta';
  text: string;
}

/** Extended thinking. Render collapsed — it is not the answer. */
export interface ChatThinkingDeltaEvent {
  type: 'thinking_delta';
  text: string;
}

/** Fires exactly ONCE per call, when the input is complete (v4 §3 traps 2 and 4). */
export interface ChatToolUseEvent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ChatToolResultEvent {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error: boolean;
}

export interface ChatUsageEvent {
  type: 'usage';
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  costUsd: number | null;
}

/** The six UI-facing events the parser reduces the CLI's JSONL to (v4 §3). */
export type ChatEvent =
  | ChatStatusEvent
  | ChatTextDeltaEvent
  | ChatThinkingDeltaEvent
  | ChatToolUseEvent
  | ChatToolResultEvent
  | ChatUsageEvent;

/**
 * ── D1 · the human gate (decided 2026-08-08) ──
 *
 * `gated: true` on a published verb is METADATA — advisory to the model, and
 * nothing intercepts the call. AC-5 requires that *"Start the run must ask
 * before feeding the live session, every time"*, and a gate the model can
 * decline to honour is not a gate.
 *
 * So a gated verb arriving from the PANE is held in main until a human answers.
 * Requests from any other client (a terminal session, `curl`, `chat:probe`)
 * keep today's advisory behaviour — which is what keeps the headless probe
 * headless, and what keeps *"agents are first-class operators"* true: an agent
 * driving the control surface directly is not a human sitting in front of a
 * confirm it cannot answer.
 */
export interface ChatGateRequest {
  /** Correlates the renderer's answer with the held request. */
  id: string;
  /** Dot-form verb, e.g. `run.start`. */
  verb: string;
  /** One line a human can actually decide on — never just the verb name. */
  summary: string;
  /** The payload as the agent sent it, so the human can see what they allow. */
  payload: unknown;
  /** When the hold expires. It DENIES at that point; it never opens. */
  expiresAt: number;
}

/** The human's answer. Anything that is not an explicit allow is a deny. */
export interface ChatGateDecision {
  id: string;
  allow: boolean;
}

/**
 * How a gated call was resolved — THREE outcomes, because two were a lie.
 *
 * `ChatGateDecision.allow` is the RENDERER's channel and stays a boolean: a
 * person either pressed Allow or they did not. This is the CALLER's channel, and
 * it has to carry a third case the renderer never sees — nobody answered at all.
 *
 * Until v5 Phase 0.3 both collapsed into `false`, and the MCP proxy labelled the
 * resulting 403 *"a human was asked and said no"* — false whenever the confirm
 * timed out or there was no window. Mirrors MCP elicitation's own
 * `accept` / `decline` / `cancel`, which exists for this exact reason.
 *
 * All three still DENY. Only `decline` is a decision.
 */
export type GateVerdict = 'accept' | 'decline' | 'cancel';

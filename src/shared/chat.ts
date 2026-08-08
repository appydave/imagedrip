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

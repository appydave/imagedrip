/**
 * Back-pressure for the chat push channel (v4 WP4 §3).
 *
 * `text_delta` can arrive per TOKEN. One `webContents.send()` per delta
 * saturates the IPC bridge — hundreds of structured-clone round trips a second
 * for a few characters each, while the renderer re-renders on every one. The
 * parser is right to emit them individually (it is a pure reducer with no view
 * of transport); batching is a transport concern that sits above it.
 *
 * Two things this must NOT get wrong:
 *
 *  - **Order.** Merging is only ever between ADJACENT deltas of the same kind.
 *    A `tool_use` landing between two text runs keeps them apart, because the
 *    transcript reads "text, then the call, then more text" and collapsing
 *    across it would reorder the conversation.
 *  - **The end of a turn.** A terminal `status` flushes immediately rather than
 *    waiting out the budget: the last few tokens of a reply arriving 25ms late
 *    is invisible, but a turn that *looks* unfinished for 25ms after it ended
 *    is a spinner that lies.
 */

import type { ChatEvent } from '../shared/chat.js';

/**
 * ~24ms — inside one 60Hz frame, so a batch lands at most one frame late and
 * the stream still reads as live typing. Below ~16ms the batching stops paying
 * for itself; above ~30ms the text visibly arrives in chunks.
 */
export const DEFAULT_FRAME_BUDGET_MS = 24;

export interface ChatCoalescer {
  push(event: ChatEvent): void;
  /** Send whatever is buffered now. */
  flush(): void;
  /** Flush and cancel the pending timer — for teardown. */
  dispose(): void;
}

/** Is this the parser's end-of-turn signal? */
function isTerminal(event: ChatEvent): boolean {
  return event.type === 'status' && (event.status === 'done' || event.status === 'error');
}

export function createChatCoalescer(
  emit: (events: ChatEvent[]) => void,
  budgetMs: number = DEFAULT_FRAME_BUDGET_MS,
): ChatCoalescer {
  let buffer: ChatEvent[] = [];
  let timer: NodeJS.Timeout | null = null;

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    emit(batch);
  }

  return {
    push(event: ChatEvent): void {
      const last = buffer[buffer.length - 1];
      if (
        last &&
        (event.type === 'text_delta' || event.type === 'thinking_delta') &&
        last.type === event.type
      ) {
        // Same kind, adjacent — one event carrying both runs of text.
        last.text += event.text;
      } else {
        buffer.push(event);
      }

      if (isTerminal(event)) {
        flush();
        return;
      }
      // `unref` so a pending 24ms timer can never hold the process open on quit.
      timer ??= setTimeout(flush, budgetMs);
      timer.unref?.();
    },
    flush,
    dispose(): void {
      flush();
    },
  };
}

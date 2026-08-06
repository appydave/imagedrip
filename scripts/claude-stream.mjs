/**
 * Claude Code stream-json parser (v4 WP3, §3 "The stream protocol").
 *
 * Reduces the CLI's stdout JSONL to six UI-facing events:
 *
 *   status | text_delta | thinking_delta | tool_use | tool_result | usage
 *
 * **Four traps, none of them guessable, each of which presents as a cosmetic
 * double-render that is actually a state bug.** They are why a parser for a
 * "just read the JSON" stream is not twenty lines:
 *
 *  1. **Two output modes, and both must work.** With `--include-partial-messages`
 *     assistant text arrives as `stream_event` deltas. WITHOUT it — older
 *     builds, or whenever the capability probe says no — text arrives ONLY in
 *     the final `assistant` wrapper. Handle one and the chat is silent on half
 *     of installs.
 *
 *  2. **Tool uses are repeated in the final wrapper, often with empty `{}`
 *     inputs.** Emit both and every tool call renders twice, the second time
 *     with its arguments missing. Tracked by tool-use id.
 *
 *  3. **Same for text.** Newer builds send deltas AND the wrapper. Tracked by
 *     message id, so a message that already streamed is not re-emitted whole.
 *
 *  4. **Tool inputs arrive fragmented**, as `input_json_delta` chunks that are
 *     not individually valid JSON. Accumulated per `messageId:blockIndex` and
 *     emitted ONCE when the block stops.
 *
 * Traps 2 and 3 are the same underlying thing: the CLI is deliberately
 * redundant so a non-streaming consumer still receives everything. Dedupe is
 * the consumer's job, and this is the consumer.
 *
 * Pure and synchronous: feed it parsed objects, take events back. No I/O, no
 * timers, no process — which is what makes it testable against recorded JSONL.
 */

/**
 * @typedef {{ type: 'status', status: string }} StatusEvent
 * @typedef {{ type: 'text_delta', text: string }} TextDeltaEvent
 * @typedef {{ type: 'thinking_delta', text: string }} ThinkingDeltaEvent
 * @typedef {{ type: 'tool_use', id: string, name: string, input: unknown }} ToolUseEvent
 * @typedef {{ type: 'tool_result', tool_use_id: string, content: unknown, is_error: boolean }} ToolResultEvent
 * @typedef {{ type: 'usage', input: number, output: number, cacheRead: number, cacheCreation: number, costUsd: number | null }} UsageEvent
 * @typedef {StatusEvent | TextDeltaEvent | ThinkingDeltaEvent | ToolUseEvent | ToolResultEvent | UsageEvent} StreamEvent
 */

/**
 * An input the wrapper "has" but that carries nothing — trap 2's signature.
 * @param {unknown} input
 * @returns {boolean}
 */
function isEmptyInput(input) {
  if (input === undefined || input === null) return true;
  return typeof input === 'object' && Object.keys(input).length === 0;
}

/** @param {any} usage @param {number | null} costUsd @returns {UsageEvent} */
function usageEvent(usage, costUsd = null) {
  return {
    type: 'usage',
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheCreation: usage?.cache_creation_input_tokens ?? 0,
    costUsd,
  };
}

export function createStreamParser() {
  /** Tool-use ids already emitted — trap 2. */
  const emittedToolUses = new Set();
  /** Message ids whose text already streamed as deltas — trap 3. */
  const streamedText = new Set();
  /** Per-content-block scratch, keyed `messageId:blockIndex` — trap 4. */
  const blocks = new Map();
  /**
   * tool-use id → its scratch key, so the `assistant` wrapper can find the
   * fragments still accumulating for the same call. Observed ordering (real
   * capture, CLI 2.1.223): content_block_start → input_json_delta × N →
   * **assistant wrapper** → content_block_stop. The wrapper arrives BEFORE the
   * block closes, so "first one wins" would hand the wrapper's copy through —
   * and on any build that ships the wrapper with `input: {}` (trap 2) the
   * arguments would vanish while the call still rendered as successful.
   */
  const pendingToolIds = new Map();
  /**
   * Content-block events carry only an index, never a message id, so the block
   * has to be attributed to the most recent assistant message. Losing this is
   * how two concurrent messages' tool inputs get spliced together.
   */
  let currentMessageId = null;
  let sessionId = null;
  /** Set when the turn's `result` frame arrives. */
  let lastResult = null;

  /**
   * @param {any} obj one parsed stdout line
   * @returns {StreamEvent[]}
   */
  function push(obj) {
    /** @type {StreamEvent[]} */
    const out = [];
    if (!obj || typeof obj !== 'object') return out;

    if (typeof obj.session_id === 'string') sessionId = obj.session_id;

    switch (obj.type) {
      case 'system':
        if (obj.subtype === 'init') out.push({ type: 'status', status: 'initializing' });
        // The CLI emits its own lifecycle frames (`requesting`, …). Prefer them
        // over anything inferred — they are the process's own account of what
        // it is doing. `hook_started` / `hook_response` are session-setup noise.
        else if (obj.subtype === 'status' && typeof obj.status === 'string') {
          out.push({ type: 'status', status: obj.status });
        }
        return out;

      case 'stream_event':
        return handleStreamEvent(obj.event, out);

      case 'assistant': {
        // Mode 2 (no --include-partial-messages) delivers everything here, and
        // mode 1 delivers it here AGAIN. Both are handled by the same code:
        // anything already emitted is skipped, anything not is emitted now.
        const message = obj.message ?? {};
        const messageId = message.id ?? currentMessageId ?? 'unknown';
        for (const block of message.content ?? []) {
          if (block.type === 'text') {
            if (!streamedText.has(messageId) && block.text) {
              out.push({ type: 'text_delta', text: block.text });
            }
          } else if (block.type === 'thinking') {
            if (!streamedText.has(`${messageId}:thinking`) && block.thinking) {
              out.push({ type: 'thinking_delta', text: block.thinking });
            }
          } else if (block.type === 'tool_use') {
            if (emittedToolUses.has(block.id)) continue;
            // Trap 2, the sharp edge: if this wrapper carries an empty input
            // while fragments are still accumulating for the same call, the
            // fragments are the truth. Stay silent and let content_block_stop
            // emit the real arguments.
            const key = pendingToolIds.get(block.id);
            const pending = key ? blocks.get(key) : null;
            if (isEmptyInput(block.input) && pending?.json) continue;
            emittedToolUses.add(block.id);
            out.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} });
          }
        }
        // Mark AFTER the loop: a wrapper that arrives without prior deltas must
        // still emit its text, and only then suppress a later duplicate.
        if (message.content?.some((/** @type {any} */ b) => b.type === 'text')) {
          streamedText.add(messageId);
        }
        if (message.usage) out.push(usageEvent(message.usage));
        return out;
      }

      case 'user': {
        for (const block of obj.message?.content ?? []) {
          if (block.type === 'tool_result') {
            out.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: Boolean(block.is_error),
            });
          }
        }
        return out;
      }

      case 'result':
        lastResult = obj;
        out.push(usageEvent(obj.usage, typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : null));
        // Not one of the six payloads but the same lifecycle channel: a
        // consumer driving turns needs a definite end-of-turn signal.
        out.push({ type: 'status', status: obj.is_error ? 'error' : 'done' });
        return out;

      default:
        return out;
    }
  }

  /**
   * @param {any} event
   * @param {StreamEvent[]} out
   * @returns {StreamEvent[]}
   */
  function handleStreamEvent(event, out) {
    if (!event || typeof event !== 'object') return out;

    switch (event.type) {
      case 'message_start':
        currentMessageId = event.message?.id ?? currentMessageId;
        out.push({ type: 'status', status: 'requesting' });
        return out;

      case 'content_block_start': {
        const key = blockKey(event.index);
        const block = event.content_block ?? {};
        if (block.type === 'tool_use') {
          blocks.set(key, { kind: 'tool_use', id: block.id, name: block.name, json: '' });
          if (block.id) pendingToolIds.set(block.id, key);
        } else if (block.type === 'thinking') {
          blocks.set(key, { kind: 'thinking' });
          out.push({ type: 'status', status: 'thinking' });
        } else {
          blocks.set(key, { kind: block.type ?? 'text' });
        }
        return out;
      }

      case 'content_block_delta': {
        const key = blockKey(event.index);
        const delta = event.delta ?? {};
        if (delta.type === 'text_delta') {
          if (currentMessageId) streamedText.add(currentMessageId);
          if (delta.text) out.push({ type: 'text_delta', text: delta.text });
        } else if (delta.type === 'thinking_delta') {
          if (currentMessageId) streamedText.add(`${currentMessageId}:thinking`);
          if (delta.thinking) out.push({ type: 'thinking_delta', text: delta.thinking });
        } else if (delta.type === 'input_json_delta') {
          // Trap 4: each chunk is a fragment, not valid JSON on its own.
          const block = blocks.get(key) ?? { kind: 'tool_use', id: undefined, name: undefined, json: '' };
          block.json = `${block.json ?? ''}${delta.partial_json ?? ''}`;
          blocks.set(key, block);
        }
        return out;
      }

      case 'content_block_stop': {
        const key = blockKey(event.index);
        const block = blocks.get(key);
        blocks.delete(key);
        flushToolBlock(block, out);
        return out;
      }

      case 'message_delta':
        if (event.usage) out.push(usageEvent(event.usage));
        return out;

      case 'message_stop': {
        // Safety net: a stream cut short after its fragments but before
        // content_block_stop would otherwise drop the call silently. Better a
        // tool_use with what we have than no record that it was attempted.
        for (const [key, block] of [...blocks]) {
          if (block?.kind === 'tool_use') {
            blocks.delete(key);
            flushToolBlock(block, out);
          }
        }
        return out;
      }

      default:
        return out;
    }
  }

  /** @param {number} index */
  function blockKey(index) {
    return `${currentMessageId ?? 'unknown'}:${index}`;
  }

  /**
   * Emit one accumulated tool-use block, once.
   * @param {any} block
   * @param {StreamEvent[]} out
   */
  function flushToolBlock(block, out) {
    if (block?.kind !== 'tool_use' || !block.id) return;
    if (emittedToolUses.has(block.id)) return;
    emittedToolUses.add(block.id);
    pendingToolIds.delete(block.id);
    let input = {};
    if (block.json) {
      try {
        input = JSON.parse(block.json);
      } catch {
        // A truncated fragment is worth surfacing raw rather than dropping: a
        // tool call with mangled arguments is a bug the operator must see.
        input = { __unparsed__: block.json };
      }
    }
    out.push({ type: 'tool_use', id: block.id, name: block.name ?? 'unknown', input });
  }

  return {
    push,
    /** @returns {string | null} */
    get sessionId() {
      return sessionId;
    },
    /** @returns {any} */
    get lastResult() {
      return lastResult;
    },
  };
}

/**
 * Split a chunk of stdout into whole lines, keeping any trailing partial.
 * The CLI writes JSONL, but a pipe read can land mid-line.
 * @param {string} buffer
 * @returns {{ lines: string[], rest: string }}
 */
export function takeLines(buffer) {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.map((l) => l.trim()).filter(Boolean), rest };
}

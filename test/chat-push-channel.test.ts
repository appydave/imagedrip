import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStreamParser, takeLines } from '../src/main/claude-stream';
import { createChatCoalescer, DEFAULT_FRAME_BUDGET_MS } from '../src/main/chat-coalesce';
import type { ChatEvent } from '../src/shared/chat';

/**
 * The push channel end to end on MAIN's side of the bridge (v4 WP4 §3):
 *
 *   real recorded CLI stdout  →  takeLines  →  parser  →  coalescer  →  send()
 *
 * Driven by JSONL RECORDED FROM THE REAL CLI (2.1.223) rather than hand-written
 * frames, for the same reason `claude-stream.test.ts` is: synthetic frames
 * agree with whatever the parser already does, and the recording is the only
 * thing that can disagree.
 *
 * What this does NOT establish: that the renderer receives them. This stops at
 * `webContents.send` — the far side of a structured-clone boundary and a React
 * subscription is not reachable from a node test, and pretending otherwise is
 * exactly the false green `chat:probe` exists to prevent. The renderer half is
 * confirmed by running the app.
 */

function frames(name: string): any[] {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/**
 * Feed the fixture the way `startClaude` actually does — as CHUNKS split at
 * arbitrary byte offsets, not as tidy lines. A pipe read lands mid-line, and
 * `takeLines` is what makes that survivable.
 */
function asChunkedStdout(name: string, chunkSize: number): string[] {
  // JSONL: every line is newline-TERMINATED, which is what the real CLI writes.
  // The case where the LAST line is not terminated is a `startClaude` concern
  // (it drains its buffer on exit) and is covered in `claude-cli.test.ts`.
  const raw = frames(name)
    .map((f) => `${JSON.stringify(f)}\n`)
    .join('');
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += chunkSize) chunks.push(raw.slice(i, i + chunkSize));
  return chunks;
}

/** Stands in for `hostWindow.webContents.send(IPC.chatEvent, …)`. */
function fakeBridge(): { sent: ChatEvent[][]; send: (events: ChatEvent[]) => void } {
  const sent: ChatEvent[][] = [];
  return { sent, send: (events) => sent.push(events) };
}

function drive(fixture: string, chunkSize = 997): ChatEvent[][] {
  const bridge = fakeBridge();
  const coalescer = createChatCoalescer(bridge.send, DEFAULT_FRAME_BUDGET_MS);
  const parser = createStreamParser();
  let buffer = '';

  for (const chunk of asChunkedStdout(fixture, chunkSize)) {
    buffer += chunk;
    const { lines, rest } = takeLines(buffer);
    buffer = rest;
    for (const line of lines) {
      let frame: any;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      for (const event of parser.push(frame)) coalescer.push(event);
    }
    // Every chunk arrives in its own tick; the budget expires between them.
    vi.advanceTimersByTime(DEFAULT_FRAME_BUDGET_MS);
  }
  coalescer.dispose();
  vi.advanceTimersByTime(DEFAULT_FRAME_BUDGET_MS);
  return bridge.sent;
}

describe('chat push channel — real CLI output onto the bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers assistant text as text_delta events (partial-messages mode)', () => {
    const batches = drive('stream-partial.jsonl');
    const text = batches
      .flat()
      .filter((e): e is Extract<ChatEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');

    expect(batches.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it('delivers text on a CLI WITHOUT --include-partial-messages too', () => {
    // Trap 1: half of installs deliver text only in the final `assistant`
    // wrapper. A push channel that works in one mode is silent on the other.
    const text = drive('stream-nopartial.jsonl')
      .flat()
      .filter((e): e is Extract<ChatEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(text.length).toBeGreaterThan(0);
  });

  it('never sends more IPC messages than the parser produced events', () => {
    // The reason the coalescer exists: without it this is one structured-clone
    // round trip per token.
    //
    // The compression RATIO is not asserted here on purpose — these recordings
    // are short replies (the partial fixture carries two deltas), so a ratio
    // taken from them would be a fact about the recording, not about the
    // transport. `chat-coalesce.test.ts` proves the collapse on volume; this
    // proves the transport never AMPLIFIES, on real data.
    for (const fixture of ['stream-partial.jsonl', 'stream-nopartial.jsonl', 'stream-tooluse.jsonl']) {
      const parser = createStreamParser();
      let events = 0;
      for (const frame of frames(fixture)) events += parser.push(frame).length;

      const batches = drive(fixture);
      expect(events).toBeGreaterThan(0);
      expect(batches.length).toBeLessThanOrEqual(events);
    }
  });

  it('emits each tool call exactly once, with its arguments intact', () => {
    // Traps 2 and 4 survive the transport: the coalescer must not merge,
    // reorder or drop a tool_use while batching the text around it.
    const toolUses = drive('stream-tooluse.jsonl')
      .flat()
      .filter((e): e is Extract<ChatEvent, { type: 'tool_use' }> => e.type === 'tool_use');

    expect(toolUses.length).toBeGreaterThan(0);
    expect(new Set(toolUses.map((t) => t.id)).size).toBe(toolUses.length);
    for (const call of toolUses) {
      expect(call.name).not.toBe('unknown');
      expect(call.input).not.toEqual({});
      expect(JSON.stringify(call.input)).not.toContain('__unparsed__');
    }
  });

  it('closes the turn with a terminal status, so the renderer can stop spinning', () => {
    const flat = drive('stream-partial.jsonl').flat();
    const last = flat[flat.length - 1];
    expect(last).toEqual({ type: 'status', status: 'done' });
  });

  it('survives stdout chunked at hostile offsets', () => {
    // A pipe read lands wherever it lands. Three chunk sizes, none aligned to a
    // line: the delivered text must be identical.
    const textOf = (size: number): string =>
      drive('stream-partial.jsonl', size)
        .flat()
        .filter((e): e is Extract<ChatEvent, { type: 'text_delta' }> => e.type === 'text_delta')
        .map((e) => e.text)
        .join('');

    const a = textOf(13);
    expect(a.length).toBeGreaterThan(0);
    expect(textOf(997)).toBe(a);
    expect(textOf(65_536)).toBe(a);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatCoalescer } from '../src/main/chat-coalesce';
import type { ChatEvent } from '../src/shared/chat';

/**
 * Back-pressure for the chat push channel (v4 WP4 §3). `text_delta` arrives per
 * token; one IPC message per delta saturates the bridge. The two things this
 * must not get wrong are ORDER and the end of a turn.
 */

describe('chat delta coalescing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function collect(): { batches: ChatEvent[][]; emit: (e: ChatEvent[]) => void } {
    const batches: ChatEvent[][] = [];
    return { batches, emit: (e) => batches.push(e) };
  }

  it('merges adjacent text deltas into one event within the frame budget', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);

    for (const text of ['Hel', 'lo ', 'wor', 'ld']) c.push({ type: 'text_delta', text });
    expect(batches).toHaveLength(0); // nothing sent yet — that is the point

    vi.advanceTimersByTime(24);
    expect(batches).toEqual([[{ type: 'text_delta', text: 'Hello world' }]]);
  });

  it('never merges ACROSS a tool call — that would reorder the transcript', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);

    c.push({ type: 'text_delta', text: 'let me look' });
    c.push({ type: 'tool_use', id: 't1', name: 'mcp__imagedrip__domain_get', input: {} });
    c.push({ type: 'text_delta', text: 'found it' });
    vi.advanceTimersByTime(24);

    expect(batches).toHaveLength(1);
    expect(batches[0].map((e) => e.type)).toEqual(['text_delta', 'tool_use', 'text_delta']);
    expect(batches[0][0]).toMatchObject({ text: 'let me look' });
    expect(batches[0][2]).toMatchObject({ text: 'found it' });
  });

  it('keeps thinking and answer text in separate events', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);

    c.push({ type: 'thinking_delta', text: 'hmm' });
    c.push({ type: 'thinking_delta', text: ' ok' });
    c.push({ type: 'text_delta', text: 'answer' });
    vi.advanceTimersByTime(24);

    expect(batches[0]).toEqual([
      { type: 'thinking_delta', text: 'hmm ok' },
      { type: 'text_delta', text: 'answer' },
    ]);
  });

  it('flushes IMMEDIATELY at end of turn — a spinner must not outlive the answer', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);

    c.push({ type: 'text_delta', text: 'done thinking' });
    c.push({ type: 'status', status: 'done' });

    // No timer advance: the batch is already out.
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      { type: 'text_delta', text: 'done thinking' },
      { type: 'status', status: 'done' },
    ]);
  });

  it('flushes immediately on an error status too', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);
    c.push({ type: 'status', status: 'error' });
    expect(batches).toHaveLength(1);
  });

  it('emits nothing when there is nothing buffered', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);
    c.flush();
    c.dispose();
    vi.advanceTimersByTime(1000);
    expect(batches).toEqual([]);
  });

  it('batches a long stream into frames rather than one message per token', () => {
    const { batches, emit } = collect();
    const c = createChatCoalescer(emit, 24);

    // 300 tokens across three frames.
    for (let frame = 0; frame < 3; frame++) {
      for (let i = 0; i < 100; i++) c.push({ type: 'text_delta', text: 'x' });
      vi.advanceTimersByTime(24);
    }

    expect(batches).toHaveLength(3);
    expect(batches.every((b) => b.length === 1)).toBe(true);
    expect(batches.map((b) => (b[0] as { text: string }).text.length)).toEqual([100, 100, 100]);
  });
});

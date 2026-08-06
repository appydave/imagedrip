import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain ESM, JSDoc-typed; see tsconfig.scripts.json
import { createStreamParser, takeLines } from '../scripts/claude-stream.mjs';

/**
 * The stream parser against JSONL RECORDED FROM THE REAL CLI (2.1.223), not
 * hand-written frames. That distinction earned its keep immediately: the
 * recording showed the `assistant` wrapper arriving BEFORE `content_block_stop`,
 * which a first-one-wins parser gets wrong in exactly the way v4 §3 trap 2
 * describes — the call still renders, with its arguments missing.
 *
 * Fixtures:
 *   stream-partial.jsonl    --include-partial-messages, text only
 *   stream-nopartial.jsonl  WITHOUT it — text arrives only in the wrapper
 *   stream-tooluse.jsonl    --include-partial-messages, one real tool call
 */

function load(name: string): any[] {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function run(name: string): any[] {
  const parser = createStreamParser();
  const events: any[] = [];
  for (const frame of load(name)) events.push(...parser.push(frame));
  return events;
}

function text(events: any[]): string {
  return events
    .filter((e) => e.type === 'text_delta')
    .map((e) => e.text)
    .join('');
}

describe('trap 1 — both output modes must work', () => {
  it('reads text from stream_event deltas when partial messages are on', () => {
    const events = run('stream-partial.jsonl');
    expect(text(events)).toBe('hello from imagedrip');
  });

  it('reads text from the assistant wrapper when they are off', () => {
    // No stream_event frames exist at all in this mode — a parser that only
    // handles deltas is silent here, which is half of all installs.
    const frames = load('stream-nopartial.jsonl');
    expect(frames.some((f) => f.type === 'stream_event')).toBe(false);
    expect(text(run('stream-nopartial.jsonl'))).toBe('hello from imagedrip');
  });
});

describe('trap 3 — text is not rendered twice', () => {
  it('emits each message’s text exactly once despite deltas AND a wrapper', () => {
    const frames = load('stream-partial.jsonl');
    // The redundancy is really there: the wrapper repeats what streamed.
    const wrapper = frames.find((f) => f.type === 'assistant');
    expect(wrapper.message.content[0].text).toBe('hello from imagedrip');
    // ...and it is still emitted only once.
    expect(text(run('stream-partial.jsonl'))).toBe('hello from imagedrip');
  });

  it('does not duplicate text across a two-message tool turn', () => {
    const combined = text(run('stream-tooluse.jsonl'));
    expect(combined).toContain("I'll list the JSONL files here.");
    expect(combined).toContain('DONE');
    // Each sentence appears once, not twice.
    expect(combined.match(/I'll list the JSONL files here\./g)).toHaveLength(1);
    expect(combined.match(/DONE/g)).toHaveLength(1);
  });
});

describe('trap 2 + 4 — tool uses', () => {
  const events = run('stream-tooluse.jsonl');
  const toolUses = events.filter((e) => e.type === 'tool_use');

  it('emits one tool_use per call, not one per frame that mentions it', () => {
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0].name).toBe('Glob');
  });

  it('emits the accumulated input, reassembled from fragments', () => {
    // The input arrived as three input_json_delta chunks, none of them valid
    // JSON alone: '', '{"pattern": "*.jsonl', '"}'
    expect(toolUses[0].input).toEqual({ pattern: '*.jsonl' });
  });

  it('fires once the input is complete, never with empty arguments', () => {
    expect(Object.keys(toolUses[0].input as object).length).toBeGreaterThan(0);
  });

  it('pairs the call with its result', () => {
    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(1);
    expect(results[0].tool_use_id).toBe(toolUses[0].id);
    expect(results[0].is_error).toBe(false);
  });
});

describe('trap 2 — the wrapper that arrives first with an empty input', () => {
  /**
   * The recorded build ships a FULL input in the wrapper, so the trap does not
   * fire there. §3 says other builds ship `{}`. This replays the documented
   * ordering — start, fragments, wrapper-with-{}, stop — and pins that the
   * fragments win. Without this, the failure is invisible until it is someone
   * else's machine.
   */
  it('prefers the accumulated fragments over an empty wrapper input', () => {
    const parser = createStreamParser();
    const events: any[] = [];
    const push = (o: any): void => {
      events.push(...parser.push(o));
    };
    push({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_1' } } });
    push({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'imagedrip_project_create', input: {} },
      },
    });
    push({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"name":"Spring' },
      },
    });
    push({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: ' nails"}' },
      },
    });
    // The wrapper, early and empty — the trap.
    push({
      type: 'assistant',
      message: {
        id: 'msg_1',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'imagedrip_project_create', input: {} }],
      },
    });
    push({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0].input).toEqual({ name: 'Spring nails' });
  });

  it('still emits a tool_use if the stream ends before content_block_stop', () => {
    const parser = createStreamParser();
    const events: any[] = [];
    const push = (o: any): void => {
      events.push(...parser.push(o));
    };
    push({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_2' } } });
    push({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_2', name: 'imagedrip_domain_get', input: {} },
      },
    });
    push({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
    });
    push({ type: 'stream_event', event: { type: 'message_stop' } });
    expect(events.filter((e) => e.type === 'tool_use')).toHaveLength(1);
  });
});

describe('lifecycle and usage', () => {
  it('reports the CLI’s own status frames', () => {
    const statuses = run('stream-tooluse.jsonl')
      .filter((e) => e.type === 'status')
      .map((e) => e.status);
    expect(statuses[0]).toBe('initializing');
    expect(statuses).toContain('requesting');
    expect(statuses.at(-1)).toBe('done');
  });

  it('reports cost and tokens from the result frame', () => {
    const usage = run('stream-tooluse.jsonl').filter((e) => e.type === 'usage');
    const final = usage.at(-1);
    expect(final.costUsd).toBeGreaterThan(0);
    expect(final.output).toBeGreaterThan(0);
  });

  it('captures the session id, so ImageDrip owns continuity', () => {
    const parser = createStreamParser();
    for (const frame of load('stream-tooluse.jsonl')) parser.push(frame);
    expect(parser.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores hook and rate-limit frames rather than rendering them', () => {
    const frames = load('stream-partial.jsonl');
    expect(frames.some((f) => f.subtype === 'hook_started')).toBe(true);
    expect(frames.some((f) => f.type === 'rate_limit_event')).toBe(true);
    // None of that noise becomes a UI event.
    expect(text(run('stream-partial.jsonl'))).toBe('hello from imagedrip');
  });
});

describe('takeLines', () => {
  it('keeps a trailing partial line for the next chunk', () => {
    const { lines, rest } = takeLines('{"a":1}\n{"b":2}\n{"c":');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('{"c":');
  });

  it('survives a chunk boundary mid-line', () => {
    const parser = createStreamParser();
    const whole = readFileSync(join(__dirname, 'fixtures', 'stream-partial.jsonl'), 'utf8');
    const events: any[] = [];
    let buffer = '';
    // 7 bytes at a time — pathological, and exactly what a pipe can do.
    for (let i = 0; i < whole.length; i += 7) {
      buffer += whole.slice(i, i + 7);
      const { lines, rest } = takeLines(buffer);
      buffer = rest;
      for (const line of lines) events.push(...parser.push(JSON.parse(line)));
    }
    expect(text(events)).toBe('hello from imagedrip');
  });
});

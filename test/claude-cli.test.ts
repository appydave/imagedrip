import { describe, it, expect } from 'vitest';
import { startClaude } from '../src/main/claude-cli.ts';
import type { ChatEvent } from '../src/shared/chat';
import {
  CHAT_ALLOWED_TOOLS,
  CHAT_DISALLOWED_TOOLS,
  ContainmentUnavailableError,
  REQUIRED_CONTAINMENT_FLAGS,
  REQUIRED_PROTOCOL_FLAGS,
  buildArgs,
  buildChatArgs,
  missingContainment,
} from '../src/main/claude-cli.ts';

/**
 * D2 (decided 2026-08-08): the in-app chat runs with Read + MCP, and with Bash,
 * Write and Edit disallowed.
 *
 * The test that matters is the FAIL-CLOSED one. `buildArgs()` gates every
 * optional flag on the capability probe (§3 mechanic 3), so the obvious
 * implementation omits `--disallowed-tools` on a CLI that does not know it and
 * spawns an agent with FULL tools — the exact inverse of the decision, and
 * silently. `buildChatArgs()` is the only door the pane may use, and it throws
 * instead.
 */

/** Everything the pane requires, as a modern CLI reports it. */
function capableCli(): Set<string> {
  return new Set([
    ...REQUIRED_PROTOCOL_FLAGS,
    ...REQUIRED_CONTAINMENT_FLAGS,
    '--include-partial-messages',
    '--model',
    '--add-dir',
    '--mcp-config',
    '--strict-mcp-config',
    '--permission-mode',
    '--session-id',
    '--resume',
  ]);
}

describe('D2 containment — the pane refuses to spawn uncontained', () => {
  it('builds argv with the deny-list and an enumerated allow-list', () => {
    const args = buildChatArgs({
      capabilities: capableCli(),
      mcpTools: ['mcp__imagedrip__domain_get', 'mcp__imagedrip__template_save'],
    });

    const allowed = args[args.indexOf('--allowed-tools') + 1].split(',');
    const disallowed = args[args.indexOf('--disallowed-tools') + 1].split(',');

    expect(disallowed).toEqual([...CHAT_DISALLOWED_TOOLS]);
    expect(disallowed).toContain('Bash');
    expect(allowed).toEqual([
      ...CHAT_ALLOWED_TOOLS,
      'mcp__imagedrip__domain_get',
      'mcp__imagedrip__template_save',
    ]);
    // The allow-list is an enumeration, not a suggestion: nothing dangerous is
    // in it even by name.
    for (const banned of CHAT_DISALLOWED_TOOLS) expect(allowed).not.toContain(banned);
  });

  it('THROWS rather than degrading when --disallowed-tools is unknown', () => {
    const old = capableCli();
    old.delete('--disallowed-tools');

    expect(() => buildChatArgs({ capabilities: old })).toThrow(ContainmentUnavailableError);
    expect(missingContainment(old)).toEqual(['--disallowed-tools']);
  });

  it('THROWS when --allowed-tools is unknown — pruning is not enumerating', () => {
    const old = capableCli();
    old.delete('--allowed-tools');
    expect(() => buildChatArgs({ capabilities: old })).toThrow(ContainmentUnavailableError);
  });

  it('THROWS when the probe answered nothing at all (CLI missing or --help failed)', () => {
    // An unchecked CLI and an incapable one are indistinguishable from here,
    // and only one of those two guesses spawns an uncontained agent.
    const missing = missingContainment(new Set());
    expect(missing).toEqual([...REQUIRED_PROTOCOL_FLAGS, ...REQUIRED_CONTAINMENT_FLAGS]);
    expect(() => buildChatArgs({ capabilities: new Set() })).toThrow(ContainmentUnavailableError);
  });

  it('THROWS when the stream protocol floor is missing — there is no degraded mode', () => {
    const old = capableCli();
    old.delete('--input-format');
    expect(() => buildChatArgs({ capabilities: old })).toThrow(/--input-format/);
  });

  it('the error names what is missing and stays readable in the pane', () => {
    try {
      buildChatArgs({ capabilities: new Set(['--input-format', '--output-format', '--verbose']) });
      expect.unreachable('buildChatArgs must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ContainmentUnavailableError);
      const e = err as ContainmentUnavailableError;
      expect(e.missing).toEqual(['--allowed-tools', '--disallowed-tools']);
      expect(e.message).toContain('--disallowed-tools');
      expect(e.message).toContain('will not start the chat');
    }
  });

  it('the fail-open behaviour buildChatArgs exists to prevent', () => {
    // Same inputs, straight through `buildArgs` — the raw builder silently
    // drops the deny-list. This is not a bug in buildArgs (mechanic 3 is
    // deliberate); it is the reason the pane may not call it directly.
    const old = capableCli();
    old.delete('--disallowed-tools');
    const args = buildArgs({ capabilities: old, disallowedTools: ['Bash'] });
    expect(args).not.toContain('--disallowed-tools');
    expect(args.join(' ')).not.toContain('Bash');
  });
});

/**
 * `takeLines` deliberately keeps a trailing partial, because a pipe read lands
 * mid-line. At EXIT that reasoning inverts: there is no more coming, so an
 * unterminated final line is a whole frame.
 *
 * This is not hypothetical plumbing. The `result` frame is the LAST thing a
 * turn emits and it is what closes the turn — lose it and `send()` never
 * settles, so the pane sits spinning until the 7-minute timeout on a CLI that
 * has already exited successfully.
 */
describe('startClaude — the last line of stdout', () => {
  /** A stand-in CLI: writes the frames, then ends. */
  function fakeCli(frames: unknown[], trailingNewline: boolean): string {
    const body = frames.map((f) => JSON.stringify(f)).join('\n') + (trailingNewline ? '\n' : '');
    // No `process.exit()` — that can truncate a pending stdout write, which
    // would make this test pass or fail on flush timing rather than on the
    // behaviour under test.
    return `process.stdout.write(${JSON.stringify(body)});`;
  }

  const FRAMES = [
    { type: 'system', subtype: 'init', session_id: 'abc-123' },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'hello' }] } },
    { type: 'result', subtype: 'success', is_error: false, usage: { output_tokens: 3 } },
  ];

  async function run(trailingNewline: boolean): Promise<ChatEvent[]> {
    const events: ChatEvent[] = [];
    const session = startClaude({
      bin: process.execPath,
      cwd: process.cwd(),
      args: ['-e', fakeCli(FRAMES, trailingNewline)],
      onEvent: (e) => events.push(e),
    });
    await new Promise<void>((resolve) => session.child.on('close', () => resolve()));
    return events;
  }

  it('parses a newline-terminated stream, as the real CLI writes it', async () => {
    const events = await run(true);
    expect(events.map((e) => e.type)).toContain('text_delta');
    expect(events[events.length - 1]).toEqual({ type: 'status', status: 'done' });
  });

  it('still delivers the final frame when the last line has NO newline', async () => {
    const events = await run(false);
    // Without the exit-drain this is where the `result` frame vanishes and the
    // turn never ends.
    expect(events[events.length - 1]).toEqual({ type: 'status', status: 'done' });
  });

  it('settles the in-flight turn rather than hanging when the child dies', async () => {
    const session = startClaude({
      bin: process.execPath,
      cwd: process.cwd(),
      // Reads nothing, answers nothing, just leaves.
      args: ['-e', 'process.exit(1);'],
    });
    await new Promise<void>((resolve) => session.child.on('close', () => resolve()));
    await expect(session.send('anyone there?')).rejects.toThrow(/claude exited/);
  });
});

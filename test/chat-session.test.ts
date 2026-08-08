import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatSession, CHAT_MCP_FILE } from '../src/main/chat-session';
import { ContainmentUnavailableError } from '../src/main/claude-cli';
import type { ClaudeSession, StartClaudeOptions } from '../src/main/claude-cli';
import type { VerbInfo } from '../src/main/verb-policy';
import type { ChatEvent } from '../src/shared/chat';

/**
 * The pane's CLI child (v4 WP4 §2), with the spawn stubbed.
 *
 * The behaviour under test is the CONTAINMENT, not the process: D2 says the
 * chat runs with Read + MCP and no Bash, and that it must FAIL CLOSED. The
 * proof that matters is that a CLI which cannot be contained produces no child
 * at all — not a child with a warning logged next to it.
 */

function verb(name: string, gated = false): VerbInfo {
  return {
    verb: name,
    channel: `imagedrip:${name.replace(/\./g, ':')}`,
    hasSchema: false,
    inputSchema: { type: 'object', properties: {} },
    payloadWrapped: false,
    gated,
    requiresEngine: false,
    description: '',
  };
}

const VERBS: VerbInfo[] = [
  verb('domain.get'),
  verb('domain.import-prompts'),
  verb('template.save'),
  verb('run.start', true),
  verb('project.delete', true),
  verb('repo.attach', true),
];

/** A modern CLI, as `claude -p --help` reports it. */
const CAPABLE = new Set([
  '--input-format',
  '--output-format',
  '--verbose',
  '--allowed-tools',
  '--disallowed-tools',
  '--include-partial-messages',
  '--add-dir',
  '--mcp-config',
  '--strict-mcp-config',
  '--permission-mode',
  '--session-id',
]);

interface Spawned {
  options: StartClaudeOptions;
  sent: string[];
  child: EventEmitter;
  closed: boolean;
}

let userData: string;
let spawns: Spawned[];
let emitted: ChatEvent[][];

function fakeSpawn(options: StartClaudeOptions): ClaudeSession {
  const child = new EventEmitter();
  const record: Spawned = { options, sent: [], child, closed: false };
  spawns.push(record);
  return {
    child: child as unknown as ClaudeSession['child'],
    parser: { push: () => [], sessionId: null, lastResult: null },
    stderr: () => '',
    async send(prompt: string) {
      record.sent.push(prompt);
      // A minimal but honest turn: one delta, then the terminal status the
      // real parser emits from the `result` frame.
      options.onEvent?.({ type: 'text_delta', text: 'ok' });
      options.onEvent?.({ type: 'status', status: 'done' });
      return [];
    },
    async close() {
      record.closed = true;
      return 0;
    },
  };
}

function makeSession(capabilities: Set<string> = CAPABLE) {
  return createChatSession({
    verbs: () => VERBS,
    controlFile: join(userData, 'control.json'),
    mcpServerPath: '/repo/scripts/imagedrip-mcp.mjs',
    userDataDir: userData,
    cwd: () => '/repo',
    addDirs: () => ['/repo/brand'],
    emit: (batch) => emitted.push(batch),
    probe: async () => capabilities,
    spawnClaude: fakeSpawn,
  });
}

/** The argv of the nth spawn, as a lookup. */
function flag(spawn: Spawned, name: string): string | undefined {
  const i = spawn.options.args.indexOf(name);
  return i === -1 ? undefined : spawn.options.args[i + 1];
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'imagedrip-chat-'));
  spawns = [];
  emitted = [];
});
afterEach(() => {
  spawns = [];
});

describe('chat session — D2 containment', () => {
  it('spawns NOTHING until the first message', async () => {
    const chat = makeSession();
    expect(chat.state()).toEqual({ running: false, busy: false, sessionId: null });
    expect(spawns).toHaveLength(0);
    // A user who never opens the Chat tab has no CLI running, and app startup
    // does not depend on `claude` being installed.
  });

  it('runs with Bash, Write and Edit disallowed', async () => {
    const chat = makeSession();
    await chat.send('hello');

    const disallowed = flag(spawns[0], '--disallowed-tools')!.split(',');
    expect(disallowed).toContain('Bash');
    expect(disallowed).toContain('Write');
    expect(disallowed).toContain('Edit');
    expect(disallowed).toContain('NotebookEdit');
  });

  it('keeps Read scoped to the brand repo — the post-v3 value D2 retains', async () => {
    const chat = makeSession();
    await chat.send('hello');

    const allowed = flag(spawns[0], '--allowed-tools')!.split(',');
    expect(allowed).toContain('Read');
    expect(allowed).toContain('Glob');
    expect(allowed).toContain('Grep');
    expect(flag(spawns[0], '--add-dir')).toBe('/repo/brand');
  });

  it('REFUSES TO SPAWN when the probe cannot confirm --disallowed-tools', async () => {
    const old = new Set(CAPABLE);
    old.delete('--disallowed-tools');
    const chat = makeSession(old);

    await expect(chat.send('hello')).rejects.toThrow(ContainmentUnavailableError);
    // The assertion that matters: no child, not a child with a warning beside it.
    expect(spawns).toHaveLength(0);
    expect(chat.state().running).toBe(false);
    // And nothing left behind — a refusal that wrote a config reads like a
    // spawn that half-happened.
    expect(existsSync(join(userData, CHAT_MCP_FILE))).toBe(false);
  });

  it('refuses when there is no usable CLI at all (empty probe)', async () => {
    const chat = makeSession(new Set());
    await expect(chat.send('hello')).rejects.toThrow(/will not start the chat/);
    expect(spawns).toHaveLength(0);
  });

  it('stays refusing on a retry — the failure is not cached open', async () => {
    const old = new Set(CAPABLE);
    old.delete('--disallowed-tools');
    const chat = makeSession(old);

    await expect(chat.send('one')).rejects.toThrow(ContainmentUnavailableError);
    await expect(chat.send('two')).rejects.toThrow(ContainmentUnavailableError);
    expect(spawns).toHaveLength(0);
  });
});

describe('chat session — gated verbs are unreachable until the D1 gate exists', () => {
  it('allow-lists only the non-gated verbs', async () => {
    const chat = makeSession();
    await chat.send('hello');
    const allowed = flag(spawns[0], '--allowed-tools')!.split(',');

    expect(allowed).toContain('mcp__imagedrip__domain_get');
    expect(allowed).toContain('mcp__imagedrip__domain_import-prompts');
    expect(allowed).toContain('mcp__imagedrip__template_save');

    expect(allowed).not.toContain('mcp__imagedrip__run_start');
    expect(allowed).not.toContain('mcp__imagedrip__project_delete');
    expect(allowed).not.toContain('mcp__imagedrip__repo_attach');
  });

  it('ALSO names every gated verb on the deny-list, so AC-5 does not rest on one list', async () => {
    const chat = makeSession();
    await chat.send('hello');
    const disallowed = flag(spawns[0], '--disallowed-tools')!.split(',');

    expect(disallowed).toContain('mcp__imagedrip__run_start');
    expect(disallowed).toContain('mcp__imagedrip__project_delete');
    expect(disallowed).toContain('mcp__imagedrip__repo_attach');
  });

  it('never gives the CLI a tool that writes to the ChatGPT webview', async () => {
    // NEVER_EXPOSED means such a verb is not in the registry at all, so this
    // asserts the property end to end rather than the mechanism.
    const chat = makeSession();
    await chat.send('hello');
    const argv = spawns[0].options.args.join(' ');
    expect(argv).not.toMatch(/harness/);
    expect(argv).not.toMatch(/inject/);
  });
});

describe('chat session — process lifetime', () => {
  it('reuses ONE child across turns, so the conversation survives', async () => {
    const chat = makeSession();
    await chat.send('first');
    await chat.send('second');

    expect(spawns).toHaveLength(1);
    expect(spawns[0].sent).toEqual(['first', 'second']);
  });

  it('claims a session id ImageDrip owns, and keeps it across turns', async () => {
    const chat = makeSession();
    await chat.send('first');
    const id = flag(spawns[0], '--session-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(chat.state().sessionId).toBe(id);
  });

  it('refuses a second turn while one is in flight', async () => {
    let release: (() => void) | null = null;
    const chat = createChatSession({
      verbs: () => VERBS,
      controlFile: join(userData, 'control.json'),
      mcpServerPath: '/repo/scripts/imagedrip-mcp.mjs',
      userDataDir: userData,
      cwd: () => '/repo',
      emit: (batch) => emitted.push(batch),
      probe: async () => CAPABLE,
      spawnClaude: (options) => {
        const base = fakeSpawn(options);
        return {
          ...base,
          send: () => new Promise((resolve) => {
            release = () => resolve([]);
          }),
        };
      },
    });

    const first = chat.send('slow one');
    await new Promise((r) => setTimeout(r, 10));
    expect(chat.state().busy).toBe(true);
    await expect(chat.send('interrupting')).rejects.toThrow(/still answering/);

    release?.();
    await first;
    expect(chat.state().busy).toBe(false);
  });

  it('two sends racing during the lazy spawn produce ONE child, not two', async () => {
    // The spawn is asynchronous (a capability probe, a config write). If `busy`
    // were claimed after it, both callers would sail past the guard and spawn.
    // The loser of the race would be orphaned — holding an open stdin, in a
    // slot that no longer points at it, invisible to teardown.
    const chat = createChatSession({
      verbs: () => VERBS,
      controlFile: join(userData, 'control.json'),
      mcpServerPath: '/repo/scripts/imagedrip-mcp.mjs',
      userDataDir: userData,
      cwd: () => '/repo',
      emit: (batch) => emitted.push(batch),
      // A probe slow enough for a second send to arrive mid-startup.
      probe: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return CAPABLE;
      },
      spawnClaude: fakeSpawn,
    });

    const results = await Promise.allSettled([chat.send('one'), chat.send('two')]);

    expect(spawns).toHaveLength(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('a child that exits clears the session, so the next turn respawns', async () => {
    const chat = makeSession();
    await chat.send('first');
    expect(chat.state().running).toBe(true);

    // `close`, not `exit` — teardown waits for stdio to finish delivering, or
    // the turn's final `result` frame is dropped on the way out.
    spawns[0].child.emit('close', 0);
    expect(chat.state().running).toBe(false);

    await chat.send('after the crash');
    expect(spawns).toHaveLength(2);
  });

  it('stop() closes the child and is safe when nothing is running', async () => {
    const chat = makeSession();
    await chat.stop(); // nothing spawned yet — must not throw
    await chat.send('hello');
    await chat.stop();

    expect(spawns[0].closed).toBe(true);
    expect(chat.state().running).toBe(false);
  });

  it('pushes coalesced batches to the renderer', async () => {
    const chat = makeSession();
    await chat.send('hello');
    // The terminal status flushes synchronously, so the turn's events are out
    // by the time send() resolves.
    expect(emitted.flat()).toEqual([
      { type: 'text_delta', text: 'ok' },
      { type: 'status', status: 'done' },
    ]);
  });
});

describe('chat session — the MCP config it writes', () => {
  it('points the child at the ImageDrip proxy and nothing else, 0600', async () => {
    const chat = makeSession();
    await chat.send('hello');

    const path = join(userData, CHAT_MCP_FILE);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);

    const config = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(config.mcpServers)).toEqual(['imagedrip']);
    expect(config.mcpServers.imagedrip.args).toEqual(['/repo/scripts/imagedrip-mcp.mjs']);
    expect(config.mcpServers.imagedrip.env.IMAGEDRIP_CONTROL_FILE).toBe(
      join(userData, 'control.json'),
    );
    // Without this the packaged Electron binary opens a second window instead
    // of running the stdio server.
    expect(config.mcpServers.imagedrip.env.ELECTRON_RUN_AS_NODE).toBe('1');

    // --strict-mcp-config: the child must not inherit whatever the user has
    // configured globally, or the pane's tool surface stops being knowable.
    expect(spawns[0].options.args).toContain('--strict-mcp-config');
    expect(flag(spawns[0], '--mcp-config')).toBe(path);
  });
});

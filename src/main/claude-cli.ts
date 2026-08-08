/**
 * Spawning the user's own Claude Code CLI (v4 §3).
 *
 * Why the user's CLI at all: ImageDrip exists because paid image APIs cost
 * ~$0.06 an image, and it drives a real logged-in ChatGPT session to avoid
 * that. An app that dodges $0.06 an image and then bills per token on its chat
 * has argued against itself — so the chat runs on the user's own subscription.
 *
 * Five mechanics here are load-bearing and easy to lose:
 *
 *  1. **The prompt goes over stdin, never argv.** Argument lists are capped
 *     (~128 KB on Linux, ~32 KB on Windows, ~8 KB through a `.cmd` shim), and a
 *     prompt carrying a brand body plus a template plus twelve subjects reaches
 *     that. A prompt on argv also lands in the process table for every user.
 *  2. **`--input-format stream-json` keeps stdin open**, so a turn can be
 *     steered mid-flight and several turns share one process and one context.
 *     Without it every turn is a fresh one-shot batch.
 *  3. **Optional flags are gated on a capability probe.** An unknown option
 *     makes the CLI exit 1 before it does anything — one unrecognised flag and
 *     the chat is dead, with a message the user never sees.
 *  4. **ImageDrip owns the session id and persists it; the CLI owns the working
 *     memory.** That split is what makes a conversation survive a restart.
 *  5. **The working directory is the sandbox.**
 *
 * **Lives in `src/main` (WP4 §1.1 option b), not `scripts/`.** The in-app pane
 * and the headless `chat:probe` drive ONE implementation, which is what makes
 * the probe evidence about the pane rather than about a sibling copy.
 */

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createStreamParser, takeLines, type StreamParser } from './claude-stream.ts';
import type { ChatEvent } from '../shared/chat.js';

const exec = promisify(execFile);

/**
 * ── D2 · the containment policy for the IN-APP pane (decided 2026-08-08) ──
 *
 * The chat gets Read + MCP. No Bash, no Write, no Edit.
 *
 * v4 §4 — *the operator chat must never touch the ChatGPT webview* — is
 * structural at the MCP layer (`NEVER_EXPOSED` means no tool to type into the
 * live session exists) and **absent at the Bash layer**: an agent with Bash can
 * `curl` the control surface directly, or do anything else at all on David's
 * machine. Removing Bash is what turns §4 from a promise into a property.
 *
 * Reading the brand repo is most of the post-v3 value and is retained via
 * `--add-dir`. The chat still WRITES, through the app's own verbs
 * (`template.save`, `domain.save-project`), which carry their own run-state
 * locks — so nothing of the chat's actual job is lost.
 */
export const CHAT_ALLOWED_TOOLS: readonly string[] = ['Read', 'Glob', 'Grep'];

export const CHAT_DISALLOWED_TOOLS: readonly string[] = ['Bash', 'Write', 'Edit', 'NotebookEdit'];

/**
 * Flags that MUST be confirmed by the probe before the pane may spawn anything.
 *
 * ⚠️ This exists because the obvious code fails OPEN. `buildArgs()` gates every
 * optional flag on `probeCapabilities()` (mechanic 3), so on a CLI that does not
 * understand `--disallowed-tools` the flag is **silently omitted** and the agent
 * spawns with **full tools, including Bash** — the exact inverse of D2.
 *
 * A containment control that quietly disappears on an old CLI is worse than
 * none, because it is believed. So the pane refuses to spawn instead, and says
 * so. `--allowed-tools` is required alongside `--disallowed-tools` because the
 * two do different jobs: the deny-list prunes the known-dangerous, the
 * allow-list makes the surface ENUMERATED, so a tool added by a future CLI
 * release is out by default rather than in by default.
 */
export const REQUIRED_CONTAINMENT_FLAGS: readonly string[] = [
  '--allowed-tools',
  '--disallowed-tools',
];

/**
 * The floor from §3 — without these the stream protocol does not exist at all,
 * so there is no degraded mode to fall back to (research §7 Q7).
 */
export const REQUIRED_PROTOCOL_FLAGS: readonly string[] = [
  '--input-format',
  '--output-format',
  '--verbose',
];

/** Raised when the installed CLI cannot be contained. Carries text fit for the pane. */
export class ContainmentUnavailableError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `This Claude Code CLI cannot be contained, so ImageDrip will not start the chat.\n\n` +
        `Missing: ${missing.join(', ')}\n\n` +
        `The in-app chat is only allowed to run with Bash, Write and Edit disabled. ` +
        `Without those flags the agent would spawn with FULL tools on this machine, ` +
        `which is the opposite of what ImageDrip promises. ` +
        `Upgrade the Claude Code CLI (\`claude --version\`) and reopen the Chat tab.`,
    );
    this.name = 'ContainmentUnavailableError';
    this.missing = missing;
  }
}

/**
 * Which optional flags this installed CLI actually understands.
 *
 * Mechanic 3: probe once, gate everything optional on the result. Never assume
 * a flag exists because the docs mention it — the docs describe some version,
 * and the user has whichever one they have.
 */
export async function probeCapabilities(bin = 'claude'): Promise<Set<string>> {
  try {
    const { stdout } = await exec(bin, ['-p', '--help'], { maxBuffer: 4 * 1024 * 1024 });
    return new Set(stdout.match(/--[a-z0-9-]+/g) ?? []);
  } catch {
    // No probe, no optional flags. The required set below is the floor that has
    // to work for the integration to exist at all.
    return new Set();
  }
}

/**
 * Which of the flags the pane REQUIRES this CLI does not have.
 *
 * An empty probe (CLI missing, or `--help` failed) reports everything missing,
 * which is the honest answer: an unchecked CLI and an incapable one are
 * indistinguishable from here, and only one of those two guesses spawns an
 * uncontained agent.
 */
export function missingContainment(capabilities: Set<string>): string[] {
  return [...REQUIRED_PROTOCOL_FLAGS, ...REQUIRED_CONTAINMENT_FLAGS].filter(
    (flag) => !capabilities.has(flag),
  );
}

export interface BuildArgsOptions {
  capabilities: Set<string>;
  sessionId?: string | null;
  resume?: boolean;
  model?: string | null;
  addDirs?: string[];
  mcpConfig?: string | null;
  permissionMode?: string | null;
  allowedTools?: string[];
  disallowedTools?: string[];
  includePartialMessages?: boolean;
}

/** Build the argv, including only flags the probe confirmed. */
export function buildArgs(options: BuildArgsOptions): string[] {
  const has = (flag: string): boolean => options.capabilities.has(flag);
  // The required floor — without these the stream protocol does not exist.
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];

  if (options.includePartialMessages !== false && has('--include-partial-messages')) {
    args.push('--include-partial-messages');
  }
  if (options.model && has('--model')) args.push('--model', options.model);
  for (const dir of options.addDirs ?? []) {
    if (has('--add-dir')) args.push('--add-dir', dir);
  }
  if (options.mcpConfig && has('--mcp-config')) {
    args.push('--mcp-config', options.mcpConfig);
    // Use ONLY the servers we passed: the probe must not inherit whatever the
    // user happens to have configured, or the transcript stops being evidence.
    if (has('--strict-mcp-config')) args.push('--strict-mcp-config');
  }
  if (options.permissionMode && has('--permission-mode')) {
    args.push('--permission-mode', options.permissionMode);
  }
  if (options.allowedTools?.length && has('--allowed-tools')) {
    args.push('--allowed-tools', options.allowedTools.join(','));
  }
  if (options.disallowedTools?.length && has('--disallowed-tools')) {
    args.push('--disallowed-tools', options.disallowedTools.join(','));
  }
  // Mechanic 4: resume an id we already own, or claim a new one.
  if (options.sessionId) {
    if (options.resume && has('--resume')) args.push('--resume', options.sessionId);
    else if (!options.resume && has('--session-id')) args.push('--session-id', options.sessionId);
  }
  return args;
}

/**
 * The ONE entry point the in-app pane may use to build argv — D2, enforced.
 *
 * Deliberately a separate function rather than a `requireContainment: true`
 * option on `buildArgs`, because an option can be forgotten and a function
 * cannot: there is no way to produce the pane's argv without going through this
 * check. It THROWS rather than degrading, which is the whole point of D2.
 *
 * `mcpTools` are the ImageDrip verb tools (`mcp__imagedrip__*`) the pane wants
 * reachable. They are passed in rather than derived here because they come from
 * the live control surface — the same registry the proxy publishes, so a verb
 * added to main appears without touching this file.
 *
 * `extraDisallowed` names verbs to deny on top of D2's fixed list — the gated
 * ones, until the D1 human gate exists to hold them for a confirm. Omitting
 * them from `mcpTools` already makes them unreachable; naming them here says so
 * twice, so "no gated verb was ever invoked" does not rest on one list being
 * complete.
 */
export function buildChatArgs(
  options: BuildArgsOptions & { mcpTools?: string[]; extraDisallowed?: string[] },
): string[] {
  const missing = missingContainment(options.capabilities);
  if (missing.length) throw new ContainmentUnavailableError(missing);

  return buildArgs({
    ...options,
    allowedTools: [...CHAT_ALLOWED_TOOLS, ...(options.mcpTools ?? [])],
    disallowedTools: [...CHAT_DISALLOWED_TOOLS, ...(options.extraDisallowed ?? [])],
  });
}

/** One user turn, as the single JSON line the CLI expects on stdin. */
export function userMessageLine(prompt: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: prompt }] },
  })}\n`;
}

export interface ClaudeSession {
  child: ChildProcess;
  parser: StreamParser;
  send(prompt: string): Promise<ChatEvent[]>;
  close(): Promise<number | null>;
  stderr(): string;
}

export interface StartClaudeOptions {
  bin?: string;
  cwd: string;
  args: string[];
  onEvent?: (event: ChatEvent) => void;
  turnTimeoutMs?: number;
  /** Extra environment for the child — e.g. the pane's own MCP credential (D1). */
  env?: NodeJS.ProcessEnv;
}

/** Start a CLI process and drive turns over its open stdin. */
export function startClaude(options: StartClaudeOptions): ClaudeSession {
  const child = spawn(options.bin ?? 'claude', options.args, {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: options.env ?? process.env,
  });

  const parser = createStreamParser();
  let buffer = '';
  let errText = '';
  /** Resolver for the turn currently in flight. */
  let settle: ((events: ChatEvent[]) => void) | null = null;
  let turnEvents: ChatEvent[] = [];
  let exited = false;
  let exitCode: number | null = null;

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk;
    const { lines, rest } = takeLines(buffer);
    buffer = rest;
    for (const line of lines) {
      let frame: any;
      try {
        frame = JSON.parse(line);
      } catch {
        continue; // Not a protocol frame; the CLI writes diagnostics to stderr.
      }
      for (const event of parser.push(frame)) {
        turnEvents.push(event);
        options.onEvent?.(event);
        // `result` closes the turn — but stdin stays OPEN so the next prompt
        // continues the same conversation (mechanic 2).
        if (event.type === 'status' && (event.status === 'done' || event.status === 'error')) {
          const done = settle;
          const collected = turnEvents;
          settle = null;
          turnEvents = [];
          done?.(collected);
        }
      }
    }
  });

  /**
   * Parse whatever is left in the buffer once no more output is coming.
   *
   * `takeLines` deliberately KEEPS a trailing partial, because a pipe read
   * lands mid-line. At EOF that reasoning inverts: an unterminated final line
   * is a whole frame, not a fragment.
   *
   * This is not hypothetical plumbing. `result` is the LAST frame of a turn and
   * it is what closes the turn — lose it and `send()` never settles, so the
   * pane spins until the 7-minute timeout on a CLI that already exited fine.
   *
   * Hooked to stdout's `end` rather than the process's `exit`: `exit` can fire
   * while stdio still has buffered data to deliver, and draining then would
   * discard exactly the bytes it exists to rescue. `end` means EOF.
   */
  function drainTail(): void {
    const tail = buffer.trim();
    buffer = '';
    if (!tail) return;
    try {
      for (const event of parser.push(JSON.parse(tail))) {
        turnEvents.push(event);
        options.onEvent?.(event);
      }
    } catch {
      // Genuinely truncated output, not a frame. stderr carries the why.
    }
  }

  child.stdout?.on('end', drainTail);

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    errText += chunk;
  });

  // `close` rather than `exit`: it fires once the stdio streams are done, so
  // the tail above has already been parsed and the settled turn carries every
  // event the child produced. `exit` alone would settle mid-drain.
  child.on('close', (code) => {
    drainTail(); // idempotent — a no-op when `end` already ran
    exited = true;
    exitCode = code;
    const done = settle;
    settle = null;
    done?.(turnEvents);
  });

  return {
    child,
    parser,
    stderr: () => errText,

    send(prompt: string): Promise<ChatEvent[]> {
      if (exited) return Promise.reject(new Error(`claude exited (${exitCode})\n${errText}`));
      return new Promise((resolve, reject) => {
        settle = resolve;
        turnEvents = [];
        const timeout = options.turnTimeoutMs ?? 300_000;
        const timer = setTimeout(() => {
          if (settle) {
            settle = null;
            reject(new Error(`turn timed out after ${timeout}ms\n${errText}`));
          }
        }, timeout);
        const original = settle;
        settle = (events) => {
          clearTimeout(timer);
          original?.(events);
        };
        // Mechanic 1: over stdin, as one newline-terminated JSON line. And do
        // NOT end() — ending stdin closes the conversation.
        child.stdin?.write(userMessageLine(prompt), (err) => {
          if (err) reject(err);
        });
      });
    },

    close(): Promise<number | null> {
      return new Promise((resolve) => {
        if (exited) {
          resolve(exitCode);
          return;
        }
        child.on('exit', (code) => resolve(code));
        child.stdin?.end();
        // A CLI wedged mid-turn must not wedge the caller.
        setTimeout(() => child.kill('SIGTERM'), 10_000).unref?.();
      });
    },
  };
}

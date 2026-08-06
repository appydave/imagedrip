/**
 * Spawning the user's own Claude Code CLI (v4 WP3, §3).
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
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStreamParser, takeLines } from './claude-stream.mjs';

const exec = promisify(execFile);

/**
 * Which optional flags this installed CLI actually understands.
 *
 * Mechanic 3: probe once, gate everything optional on the result. Never assume
 * a flag exists because the docs mention it — the docs describe some version,
 * and the user has whichever one they have.
 * @param {string} [bin]
 * @returns {Promise<Set<string>>}
 */
export async function probeCapabilities(bin = 'claude') {
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
 * Build the argv, including only flags the probe confirmed.
 * @param {{
 *   capabilities: Set<string>,
 *   sessionId?: string | null,
 *   resume?: boolean,
 *   model?: string | null,
 *   addDirs?: string[],
 *   mcpConfig?: string | null,
 *   permissionMode?: string | null,
 *   allowedTools?: string[],
 *   disallowedTools?: string[],
 *   includePartialMessages?: boolean,
 * }} options
 * @returns {string[]}
 */
export function buildArgs(options) {
  const has = (/** @type {string} */ flag) => options.capabilities.has(flag);
  // The required floor — without these the stream protocol does not exist.
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
  ];

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
 * One user turn, as the single JSON line the CLI expects on stdin.
 * @param {string} prompt
 * @returns {string}
 */
export function userMessageLine(prompt) {
  return `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: prompt }] },
  })}\n`;
}

/**
 * @typedef {{
 *   child: import('node:child_process').ChildProcess,
 *   parser: ReturnType<typeof createStreamParser>,
 *   send(prompt: string): Promise<any[]>,
 *   close(): Promise<number | null>,
 *   stderr(): string,
 * }} ClaudeSession
 */

/**
 * Start a CLI process and drive turns over its open stdin.
 *
 * @param {{
 *   bin?: string,
 *   cwd: string,
 *   args: string[],
 *   onEvent?: (event: any) => void,
 *   turnTimeoutMs?: number,
 * }} options
 * @returns {ClaudeSession}
 */
export function startClaude(options) {
  const child = spawn(options.bin ?? 'claude', options.args, {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  const parser = createStreamParser();
  let buffer = '';
  let errText = '';
  /** Resolver for the turn currently in flight. */
  /** @type {((events: any[]) => void) | null} */
  let settle = null;
  /** @type {any[]} */
  let turnEvents = [];
  let exited = false;
  /** @type {number | null} */
  let exitCode = null;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const { lines, rest } = takeLines(buffer);
    buffer = rest;
    for (const line of lines) {
      /** @type {any} */
      let frame;
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

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    errText += chunk;
  });

  child.on('exit', (code) => {
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

    send(prompt) {
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
        child.stdin.write(userMessageLine(prompt), (err) => {
          if (err) reject(err);
        });
      });
    },

    close() {
      return new Promise((resolve) => {
        if (exited) {
          resolve(exitCode);
          return;
        }
        child.on('exit', (code) => resolve(code));
        child.stdin.end();
        // A CLI wedged mid-turn must not wedge the probe.
        setTimeout(() => child.kill('SIGTERM'), 10_000).unref?.();
      });
    },
  };
}

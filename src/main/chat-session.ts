/**
 * The resident chat's CLI child, owned by main (v4 WP4 §2).
 *
 * **Main, not the renderer.** `contextIsolation` is on and the renderer has no
 * Node access; only main can `spawn`. This matches every other privileged
 * capability in the app.
 *
 * **One long-lived child per app session, not one per turn.** `--input-format
 * stream-json` keeps stdin open (mechanic 2), so several turns share one
 * process and one context. Spawning per turn would throw the conversation away
 * and re-pay startup on every message.
 *
 * **Lazy.** A user who never opens the Chat tab should not have a CLI running,
 * and app startup must not depend on `claude` being installed. The child is
 * spawned on the first message and not before.
 *
 * Two containment properties are enforced here rather than described:
 *
 *  - **D2 — no Bash, no Write, no Edit.** Built through `buildChatArgs()`, which
 *    THROWS when the capability probe cannot confirm the tool-restriction flags.
 *    There is no degraded path: a chat that quietly spawns with full tools is
 *    worse than no chat, because it is believed.
 *  - **D1 — a gated verb from HERE stops at a human.** This session mints its
 *    own credential and hands it to the MCP proxy through the environment, so
 *    main can tell the pane's calls apart from a terminal session's. Gated
 *    verbs are therefore ALLOWED through to the CLI: they are intercepted at
 *    the call layer, where a person answers, rather than blocked at the flag
 *    layer where nobody is asked. AC-5 is satisfied by someone deciding, not
 *    by the chat being unable to raise the question.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@appydave/core';
import type { ChatEvent } from '../shared/chat.js';
import { isPaneDenied, toMcpToolName, type VerbInfo } from './verb-policy.js';
import {
  ContainmentUnavailableError,
  buildChatArgs,
  missingContainment,
  probeCapabilities,
  startClaude,
  type ClaudeSession,
  type StartClaudeOptions,
} from './claude-cli.js';
import { createChatCoalescer, type ChatCoalescer } from './chat-coalesce.js';

/** `<userData>/chat-mcp.json` — the ONLY MCP config the pane's CLI is given. */
export const CHAT_MCP_FILE = 'chat-mcp.json';

/**
 * A deliberate divergence from §3, which writes `--permission-mode
 * bypassPermissions`, and the same divergence `chat-probe.mjs` already makes
 * for the same reason.
 *
 * Under `bypassPermissions` everything not explicitly denied is auto-approved,
 * which would reduce `--allowed-tools` to decoration — a tool added by a future
 * CLI release would be IN by default. Under `auto` the allow-list is a real
 * enumeration and anything unlisted is refused with no human at the terminal to
 * wave it through. §3's `bypassPermissions` was written before D2 existed; D2
 * is the later and more specific decision.
 */
const PERMISSION_MODE = 'auto';

/** A turn is a long operation — a twelve-prompt generation runs for minutes. */
const TURN_TIMEOUT_MS = 420_000;

export interface ChatSessionDeps {
  /** The live published registry — same source the MCP proxy reads over HTTP. */
  verbs: () => VerbInfo[];
  /** Absolute path to `control.json`; the proxy's single read. */
  controlFile: string;
  /** Absolute path to `scripts/imagedrip-mcp.mjs`. */
  mcpServerPath: string;
  /** Electron's `userData` — where the generated MCP config is written. */
  userDataDir: string;
  /** The sandbox (mechanic 5). Resolved per spawn, so it follows the active brand. */
  cwd: () => Promise<string> | string;
  /** Extra READ-scoped roots — the brand repo (D2 keeps `--add-dir`). */
  addDirs?: () => Promise<string[]> | string[];
  /** main → renderer push, already coalesced into batches. */
  emit: (events: ChatEvent[]) => void;
  bin?: string;
  model?: string | null;
  logger?: Logger;
  /** Seams for tests — never set in production. */
  probe?: (bin?: string) => Promise<Set<string>>;
  spawnClaude?: (options: StartClaudeOptions) => ClaudeSession;
}

export interface ChatSessionState {
  /** Is a CLI child alive right now? */
  running: boolean;
  /** Is a turn in flight? */
  busy: boolean;
  /** The id ImageDrip owns and the CLI was told to claim (mechanic 4). */
  sessionId: string | null;
}

export interface ChatSessionHandle {
  state(): ChatSessionState;
  /**
   * The credential identifying THIS pane session to the control surface (D1),
   * or null when no child is alive.
   *
   * Read live by the control surface rather than handed to it once, so it
   * follows a respawn and goes dead with a teardown. Never leaves main and
   * never reaches the renderer — it is not a secret the UI has any use for.
   */
  paneToken(): string | null;
  /** Send one turn. Resolves when the turn's `result` frame arrives. */
  send(prompt: string): Promise<void>;
  /** Close stdin and let the child exit; safe to call when nothing is running. */
  stop(): Promise<void>;
  /**
   * Teardown for `will-quit`, where async work is not awaited.
   *
   * The child holds an OPEN stdin and will not exit on its own (mechanic 2 is
   * what keeps it alive between turns), and on macOS a child outlives a parent
   * that exits without killing it. So this closes stdin AND signals, rather
   * than politely asking and hoping the event loop survives long enough.
   */
  stopSync(): void;
}

export function createChatSession(deps: ChatSessionDeps): ChatSessionHandle {
  const probe = deps.probe ?? probeCapabilities;
  const spawnClaude = deps.spawnClaude ?? startClaude;

  let session: ClaudeSession | null = null;
  let coalescer: ChatCoalescer | null = null;
  let sessionId: string | null = null;
  /**
   * A turn is in progress — which INCLUDES the lazy spawn, not just the CLI
   * round trip. See `send()`: claiming this before the spawn is awaited is what
   * makes the whole thing single-flight.
   */
  let busy = false;
  /**
   * D1 — the credential that says "this call came from the pane".
   *
   * Minted per spawn, handed to the MCP proxy through the child's ENVIRONMENT,
   * and deliberately NOT written into `control.json`: the whole design rests on
   * possessing that file's bearer token not making you the pane. It is also
   * cleared the moment the child dies, so a stale credential cannot outlive the
   * session that earned it and put a confirm in front of a human for a chat
   * that is no longer running.
   */
  let paneToken: string | null = null;

  /**
   * The tool surface the pane's CLI is given.
   *
   * With the D1 gate in place, GATED verbs are allowed through to the CLI —
   * that is the point of building the gate. They are no longer blocked at the
   * flag layer because they are now intercepted at the call layer, where a
   * human answers. Blocking them here as well would mean the confirm dialog
   * could never fire, and AC-5 would be satisfied by the chat being unable to
   * ask rather than by a person deciding.
   *
   * `PANE_DENIED_VERBS` is the exception and stays on the deny-list: those
   * cannot be honestly confirmed, so the agent should not be able to raise the
   * dialog at all.
   */
  function toolPolicy(): { allow: string[]; deny: string[] } {
    const allow: string[] = [];
    const deny: string[] = [];
    for (const verb of deps.verbs()) {
      const name = toMcpToolName(verb.verb);
      if (isPaneDenied(verb.verb)) deny.push(name);
      else allow.push(name);
    }
    return { allow, deny };
  }

  /**
   * Write the one MCP config the child may use.
   *
   * `ELECTRON_RUN_AS_NODE` is what lets the packaged Electron binary run the
   * plain-ESM proxy: the app cannot assume a system `node` is installed, and
   * `process.execPath` without this variable would launch a second ImageDrip
   * window instead of a stdio server.
   */
  async function writeMcpConfig(client: string): Promise<string> {
    const path = join(deps.userDataDir, CHAT_MCP_FILE);
    const config = {
      mcpServers: {
        imagedrip: {
          command: process.execPath,
          args: [deps.mcpServerPath],
          env: {
            ELECTRON_RUN_AS_NODE: '1',
            IMAGEDRIP_CONTROL_FILE: deps.controlFile,
            // D1. This is what makes a gated verb from this child stop at a
            // human, while the same verb from a terminal session does not.
            IMAGEDRIP_CLIENT_TOKEN: client,
          },
        },
      },
    };
    // It names the control file, which names the token — same posture as
    // control.json itself. Unlink first: `mode` is ignored for an existing file.
    await fs.rm(path, { force: true });
    await fs.writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
    return path;
  }

  async function ensureSession(): Promise<ClaudeSession> {
    if (session) return session;

    const capabilities = await probe(deps.bin);

    // The containment check comes FIRST, before any setup work and before
    // anything is written to disk. `buildChatArgs` would raise the same error a
    // few lines below, but a refusal that has already left a generated MCP
    // config behind reads like a spawn that half-happened. Fail closed AND
    // fail clean.
    const missing = missingContainment(capabilities);
    if (missing.length) {
      deps.logger?.warn({ missing }, 'chat: refusing to spawn — CLI cannot be contained (D2)');
      throw new ContainmentUnavailableError(missing);
    }

    const { allow, deny } = toolPolicy();
    const addDirs = (await deps.addDirs?.()) ?? [];
    const cwd = await deps.cwd();

    // Mechanic 4, both directions. The FIRST spawn claims a fresh id with
    // `--session-id`; a respawn after the child died continues the same
    // conversation with `--resume`. Claiming an id the CLI has already seen is
    // an error, so getting this backwards turns one crash into a dead pane.
    const resume = sessionId !== null;
    const id = sessionId ?? randomUUID();
    // A fresh pane credential for every spawn — a respawn is a new client, and
    // the old credential stops meaning anything the moment it is replaced.
    const client = randomBytes(32).toString('hex');
    const args = buildChatArgs({
      capabilities,
      sessionId: id,
      resume,
      model: deps.model ?? null,
      addDirs,
      mcpConfig: await writeMcpConfig(client),
      permissionMode: PERMISSION_MODE,
      mcpTools: allow,
      // Every gated verb, named. The allow-list above already omits them; this
      // says so twice, because "AC-5 holds" should not rest on one list being
      // complete.
      extraDisallowed: deny,
    });

    deps.logger?.info(
      { cwd, addDirs, allowed: allow.length, denied: deny.length, sessionId: id, resume },
      'chat: spawning contained CLI (no Bash, no Write, no Edit)',
    );

    const local = createChatCoalescer(deps.emit);
    coalescer = local;

    session = spawnClaude({
      bin: deps.bin,
      cwd,
      args,
      turnTimeoutMs: TURN_TIMEOUT_MS,
      onEvent: (event) => local.push(event),
    });
    sessionId = id;
    paneToken = client;

    // `close`, not `exit`: `exit` fires while stdio may still have buffered
    // output to deliver, and the last thing a turn emits is the `result` frame
    // that closes it. Tearing down on `exit` would drop the tail that
    // `startClaude` drains at EOF — the very frame the pane is waiting for.
    session.child.on('close', (code) => {
      deps.logger?.info({ code }, 'chat: CLI exited');
      local.dispose();
      if (coalescer === local) coalescer = null;
      session = null;
      busy = false;
      // Revoke: a credential that outlives its child would put a confirm in
      // front of a human for a chat that is no longer running.
      if (paneToken === client) paneToken = null;
    });

    return session;
  }

  return {
    state(): ChatSessionState {
      return { running: session !== null, busy, sessionId };
    },

    paneToken(): string | null {
      return paneToken;
    },

    async send(prompt: string): Promise<void> {
      // One turn at a time. The CLI's stdin would accept a second line, but the
      // parser resolves ONE in-flight turn, so a concurrent send would hand the
      // first turn's events to the second caller.
      if (busy) throw new Error('the chat is still answering — wait for it to finish');
      // Claimed BEFORE the spawn is awaited, and that order is the whole guard.
      // Starting is asynchronous — a capability probe, a config write — so with
      // the flag set afterwards a second `send()` arriving during startup would
      // sail past the check above and spawn a SECOND CLI. The first child would
      // then be orphaned in a slot that no longer points at it: still holding an
      // open stdin, and invisible to teardown.
      busy = true;
      try {
        const live = await ensureSession();
        await live.send(prompt);
      } finally {
        busy = false;
        // A turn that ended is worth showing immediately, even if the terminal
        // status never arrived (a timeout, or a child that died mid-turn).
        coalescer?.flush();
      }
    },

    async stop(): Promise<void> {
      const live = session;
      session = null;
      busy = false;
      paneToken = null;
      coalescer?.dispose();
      coalescer = null;
      if (!live) return;
      await live.close();
    },

    stopSync(): void {
      const live = session;
      session = null;
      busy = false;
      paneToken = null;
      coalescer = null; // do NOT flush: the renderer is going away too
      if (!live) return;
      try {
        live.child.stdin?.end();
        live.child.kill('SIGTERM');
      } catch {
        // Already gone, or never really started — either way nothing to clean.
      }
    },
  };
}

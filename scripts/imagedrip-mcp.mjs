#!/usr/bin/env node
/**
 * ImageDrip MCP server (v4 WP2) — a stdio proxy in front of the control surface.
 *
 * It holds no state, never touches the filesystem beyond one read of
 * `control.json`, and contains no policy of its own: **every tool resolves to a
 * `fetch()`**. The tool list, the input schemas, the confirm-first flags and the
 * descriptions all arrive from `GET /v1/verbs`, which derives them from the
 * SAME Zod schemas the renderer is held to. That is the point — a proxy with
 * opinions is a second source of truth, and the pair drifts.
 *
 * Consequences worth stating, because they are features:
 *   - A verb added to `src/main/index.ts` appears here with no change to this file.
 *   - A run-state lock refuses an agent exactly as it refuses the UI (409).
 *   - Channels that write to the ChatGPT webview are never published, so no
 *     tool exists that could type into the live session (v4 §4).
 *
 * Wire format: newline-delimited JSON-RPC 2.0 on stdin/stdout. Nothing but
 * protocol frames may go to stdout — diagnostics go to stderr.
 *
 * Usage (.mcp.json):
 *   { "mcpServers": { "imagedrip": { "command": "node",
 *       "args": ["<repo>/scripts/imagedrip-mcp.mjs"] } } }
 *
 * Env:
 *   IMAGEDRIP_CONTROL_FILE  override the control.json path (tests, other machines)
 */

import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/** The MCP revision we speak; a client asking for another known one is echoed back. */
const PROTOCOL_VERSION = '2025-06-18';
const KNOWN_PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const SERVER_INFO = { name: 'imagedrip', version: '0.1.0' };

/**
 * Where Electron's `userData` lives, per platform — the same folder that holds
 * `domain.json`. One read gets both the port and the token, which is the whole
 * reason they are published together (v4 §9.2d).
 * @returns {string}
 */
function controlFilePath() {
  const override = process.env.IMAGEDRIP_CONTROL_FILE;
  if (override) return override;
  const app = 'imagedrip';
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', app, 'control.json');
  if (platform() === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), app, 'control.json');
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), app, 'control.json');
}

/**
 * @typedef {{ port: number, token: string, pid: number }} ControlFile
 */

/**
 * Read the published port + token.
 * @returns {Promise<ControlFile>}
 */
async function readControlFile() {
  const path = controlFilePath();
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(
      `ImageDrip is not running (no control file at ${path}). Open ImageDrip and try again — ` +
        'its verbs only exist while the app is up.',
    );
  }
  const parsed = JSON.parse(raw);
  if (typeof parsed?.port !== 'number' || typeof parsed?.token !== 'string') {
    throw new Error(`control file at ${path} is malformed`);
  }
  return parsed;
}

/**
 * @param {ControlFile} control
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [init]
 * @returns {Promise<{ status: number, body: any }>}
 */
async function callControl(control, path, init = {}) {
  const res = await fetch(`http://127.0.0.1:${control.port}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${control.token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: 'unparseable_response', text };
  }
  return { status: res.status, body };
}

/**
 * `template.create` → `template_create`.
 *
 * MCP tool names are restricted to `[A-Za-z0-9_-]`, so the dot cannot survive.
 * The mapping is mechanical and reversible, and the verb travels in the tool
 * description too, so nothing is lost.
 * @param {string} verb
 * @returns {string}
 */
export function toolName(verb) {
  return verb.replace(/\./g, '_');
}

/**
 * Turn one published verb into an MCP tool declaration.
 *
 * Everything here is copied, not decided. The only added text is the
 * confirm-first banner, and that is a restatement of the surface's own `gated`
 * flag in the one place an agent is guaranteed to read.
 * @param {any} verb
 * @returns {{ name: string, description: string, inputSchema: any }}
 */
export function toTool(verb) {
  const gate = verb.gated
    ? 'CONFIRM-FIRST — you must ask the user and get an explicit yes before calling this. Never call it on your own initiative. '
    : '';
  // Same principle as the confirm-first banner: a restatement of the surface's
  // own flag, in the one place an agent is guaranteed to read. Without it the
  // precondition is only discoverable by tripping it, and by then the agent has
  // usually already told the user their batch is starting.
  const engine = verb.requiresEngine
    ? 'REQUIRES A SIGNED-IN ENGINE — call imagedrip_context_get first and check engine.ready. If it is false, relay engine.hint to the user and STOP; a human must sign in to ChatGPT by hand in the app on that machine, and no tool call can do it for them. '
    : '';
  return {
    name: toolName(verb.verb),
    description: `${gate}${engine}${verb.description} (ImageDrip verb: ${verb.verb})`,
    inputSchema: verb.inputSchema ?? { type: 'object', properties: {} },
  };
}

/**
 * The payload to POST for a tool call — unwraps the `{ payload }` envelope the
 * surface asked for on bare-scalar verbs.
 * @param {any} verb
 * @param {Record<string, unknown> | undefined} args
 * @returns {unknown}
 */
export function toPayload(verb, args) {
  if (verb.payloadWrapped) return args?.payload;
  if (args === undefined || args === null) return undefined;
  if (typeof args === 'object' && Object.keys(args).length === 0 && !verb.hasSchema) return undefined;
  return args;
}

/**
 * Render a control-surface response as an MCP tool result.
 *
 * A refusal is returned as `isError` with the status and the handler's own
 * message intact — never softened, never retried here. That is what lets the
 * agent tell "you may not do that right now" (409) from "you sent garbage"
 * (422), and report the block instead of improvising around it.
 * @param {{ status: number, body: any }} res
 * @returns {{ content: {type: 'text', text: string}[], isError?: boolean }}
 */
export function toToolResult(res) {
  if (res.status === 200) {
    const result = res.body?.result ?? null;
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
  const label =
    res.status === 409 && res.body?.error === 'engine_not_ready'
      ? // Distinguished from an ordinary refusal because the resolution differs:
        // a run-state lock clears itself when the run ends, but this one clears
        // only when a HUMAN acts. Telling the agent to wait and retry would
        // leave it polling a condition no amount of waiting can change.
        'BLOCKED — the ChatGPT engine is not ready. A HUMAN must fix this; retrying will not. Relay the message below to the user verbatim and stop'
      : res.status === 409
        ? 'REFUSED by ImageDrip (this is a rule, not a bug — report it to the user; do not work around it)'
        : res.status === 422
        ? 'INVALID INPUT — correct the payload from the issues below and retry'
        : res.status === 404
          ? 'NO SUCH VERB — this capability does not exist in ImageDrip. Tell the user it cannot be done'
          : res.status === 401
            ? 'UNAUTHORIZED — ImageDrip restarted and reissued its token; retry'
            : `ImageDrip returned HTTP ${res.status}`;
  return {
    content: [{ type: 'text', text: `${label}\n\n${JSON.stringify(res.body, null, 2)}` }],
    isError: true,
  };
}

/** @param {unknown} message */
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * @param {string | number} id
 * @param {unknown} result
 */
function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

/**
 * @param {string | number} id
 * @param {number} code
 * @param {string} message
 */
function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

/**
 * @param {any} msg
 * @returns {Promise<void>}
 */
async function handle(msg) {
  const { id, method, params } = msg ?? {};

  // Notifications carry no id and take no reply.
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      reply(id, {
        protocolVersion: KNOWN_PROTOCOLS.has(asked) ? asked : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
      return;
    }

    case 'ping':
      reply(id, {});
      return;

    case 'tools/list': {
      try {
        const control = await readControlFile();
        const res = await callControl(control, '/v1/verbs');
        if (res.status !== 200) {
          replyError(id, -32603, `ImageDrip control surface returned HTTP ${res.status}`);
          return;
        }
        reply(id, { tools: res.body.verbs.map(toTool) });
      } catch (err) {
        replyError(id, -32603, err instanceof Error ? err.message : String(err));
      }
      return;
    }

    case 'tools/call': {
      try {
        const control = await readControlFile();
        const verbs = (await callControl(control, '/v1/verbs')).body?.verbs ?? [];
        const wanted = params?.name;
        const verb = verbs.find((/** @type {any} */ v) => toolName(v.verb) === wanted);
        if (!verb) {
          reply(id, {
            content: [{ type: 'text', text: `No such ImageDrip tool: ${wanted}` }],
            isError: true,
          });
          return;
        }
        const payload = toPayload(verb, params?.arguments);
        const res = await callControl(control, `/v1/call/${encodeURIComponent(verb.verb)}`, {
          method: 'POST',
          body: payload === undefined ? {} : payload,
        });
        reply(id, toToolResult(res));
      } catch (err) {
        reply(id, {
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
      return;
    }

    // Nothing else is declared in `capabilities`, so nothing else should arrive.
    default:
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

/** Read newline-delimited JSON-RPC from stdin until it closes. */
export function serve() {
  const rl = createInterface({ input: process.stdin });
  /** @type {Promise<void>} */
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      process.stderr.write(`imagedrip-mcp: ignoring non-JSON line\n`);
      return;
    }
    // Serialised: replies must not interleave, and ordering keeps a client's
    // request/response pairing obvious in a transcript.
    chain = chain.then(() =>
      handle(msg).catch((err) => {
        process.stderr.write(`imagedrip-mcp: ${err instanceof Error ? err.stack : String(err)}\n`);
      }),
    );
  });
  rl.on('close', () => process.exit(0));
}

// Only serve when executed directly — importing this file (tests) must not
// take over stdin.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) serve();

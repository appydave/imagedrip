/**
 * The loopback control surface (v4 WP1, §9.2) — one API, two clients.
 *
 * ImageDrip's ~46 `imagedrip:*` verbs already exist and already work. Their only
 * defect is reachability: they terminate inside an Electron window, where an
 * agent, a script, or another session cannot reach them. This serves the SAME
 * registry over HTTP on 127.0.0.1.
 *
 * It mirrors `IpcRouter.list()` rather than declaring parallel routes, and that
 * one decision buys three properties that are otherwise expensive:
 *
 *   - **No schema drift.** Validation uses the handler's own `def.input`. This
 *     file defines no schema of its own; there is exactly one contract per verb.
 *   - **Locks are inherited.** Run-state locks live inside the handlers, so
 *     "brand is locked while a run is live" refuses an agent exactly as it
 *     refuses the UI. An agent cannot route around a rule the human is subject to.
 *   - **v3 is a non-event.** The routes mirror the channel contract, not the
 *     storage, so re-pointing handlers at files on disk changes nothing here.
 *
 * Status codes carry meaning and must not be flattened together:
 *
 *   404  unknown or unpublished verb
 *   422  the payload failed the verb's Zod schema — body carries the issues
 *   409  the handler refused — body carries its message VERBATIM
 *   500  anything else
 *
 * The 409/422 split is what lets an agent tell *"you may not do that right now"*
 * from *"you sent garbage"*, which is what makes v4 AC-4 — report the block,
 * do not improvise around it — achievable rather than aspirational.
 *
 * Security posture: bound to the loopback interface only, never a wildcard
 * address; every route except `/v1/health` requires a bearer token minted fresh
 * each launch and published, with the resolved port, in one 0600 file.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@appydave/core';
import type { HandlerDef } from './ipc-router.js';
import {
  describeVerb,
  isExposed,
  isGated,
  isPaneDenied,
  requiresEngine,
  toVerb,
  type VerbInfo,
} from './verb-policy.js';
import type { EngineReadiness } from './engine-readiness.js';
import { toToolInputSchema } from './zod-to-json-schema.js';

/** Loopback only. Never a wildcard bind — this surface is for this machine. */
const HOST = '127.0.0.1';

/**
 * How a caller says "I am the in-app pane" (D1).
 *
 * A SECOND credential, alongside the bearer token, and the separation is the
 * whole point: the bearer answers *may you call at all*, this answers *who are
 * you*. They are deliberately not the same value and not in the same file —
 * possessing `control.json` must NOT make you the pane, or the gate would hold
 * every terminal session too and `chat:probe` would stop being headless.
 *
 * Minted per pane-session in `chat-session.ts` and handed to the MCP proxy out
 * of band, through the child's environment.
 */
export const CLIENT_HEADER = 'x-imagedrip-client';

export const DEFAULT_CONTROL_PORT = 7180;

/** `<userData>/control.json` — port + token + pid, discovered in one read. */
export const CONTROL_FILE = 'control.json';

/** The verb `/v1/context` dispatches to, so the route and the verb cannot diverge. */
export const CONTEXT_CHANNEL = 'imagedrip:context:get';

/** Refuse absurd bodies rather than buffering them. Prompt lists are text, not blobs. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Used when no readiness probe is wired at all. It still refuses: an unchecked
 * engine and a broken engine are indistinguishable from here, and only one of
 * those two guesses can type prompts into a login form.
 */
const UNKNOWN_ENGINE_MESSAGE =
  'The ChatGPT engine could not be checked from this process, so a run is refused rather than started blind. Ask the user to open ImageDrip on this machine and confirm the right-hand pane shows a signed-in ChatGPT.';

export interface ControlSurfaceOptions {
  /** Live view of the IPC registry — read per request, so late registrations appear. */
  defs: () => ReadonlyMap<string, HandlerDef<unknown, unknown>>;
  /** Where `control.json` is published (Electron's `userData`). */
  userDataDir: string;
  /** App version, reported by `/v1/health`. */
  version: string;
  /** Is a batch live? Reported by `/v1/health` so a client can see the gate before it trips. */
  isRunning: () => boolean;
  /**
   * Can the ChatGPT engine accept a prompt? Consulted before every
   * engine-requiring verb (`ENGINE_REQUIRED_VERBS`).
   *
   * Optional so the surface stays constructible in tests and in any host that
   * has no webview — but when it is omitted the engine is treated as UNKNOWN
   * and those verbs are refused, never waved through. A missing check is not
   * evidence of a working engine.
   */
  engineReadiness?: () => Promise<EngineReadiness>;
  /**
   * The credential that identifies the in-app pane right now, or null when no
   * pane session is alive (D1). Read per request, because it is minted fresh
   * for each spawned CLI and must stop identifying anyone the moment that
   * child is gone.
   */
  paneToken?: () => string | null;
  /**
   * Ask a HUMAN to approve one gated verb from the pane. Resolves true only on
   * an explicit allow.
   *
   * Optional so the surface stays constructible in tests and in any host with
   * no window — but when it is omitted a gated call from the pane is REFUSED,
   * never waved through. The pane's whole premise is that a person is sitting
   * there; if we cannot reach them, we do not have their consent.
   */
  confirmGated?: (request: GatedCall) => Promise<boolean>;
  /** Explicit port; otherwise `IMAGEDRIP_CONTROL_PORT`, otherwise 7180. `0` = OS-assigned. */
  port?: number;
  logger?: Logger;
}

/** One gated call, held pending a human answer. */
export interface GatedCall {
  verb: string;
  payload: unknown;
  /** The verb's own "when to call it" text — what the confirm should explain. */
  description: string;
}

export interface ControlSurfaceInfo {
  port: number;
  token: string;
}

/** What `control.json` holds — the client's single read. */
export interface ControlFile extends ControlSurfaceInfo {
  pid: number;
}

function resolvePort(explicit?: number): number {
  if (typeof explicit === 'number') return explicit;
  const env = process.env.IMAGEDRIP_CONTROL_PORT;
  if (env !== undefined && env !== '') {
    const n = Number(env);
    // `0` is meaningful (OS-assigned), so only a non-number falls back.
    if (Number.isInteger(n) && n >= 0 && n <= 65535) return n;
  }
  return DEFAULT_CONTROL_PORT;
}

/** Constant-time comparison — length mismatch short-circuits before the compare. */
function secretMatches(given: string | undefined, expected: string | null): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Constant-time bearer comparison. */
function tokenMatches(header: string | undefined, token: string): boolean {
  if (!header) return false;
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return secretMatches(header.slice(prefix.length), token);
}

/**
 * Is this request the in-app pane (D1)?
 *
 * Compared in constant time like the bearer, and false whenever no pane
 * session is alive. Note which way the default falls: an unrecognised or
 * absent header means "not the pane", so an unknown caller gets today's
 * behaviour rather than being held in front of a human. That is the correct
 * default *because* the pane is the only client with a human attached —
 * holding anyone else would block a headless caller on a confirm nobody is
 * there to answer.
 */
function isPaneRequest(headerValue: unknown, paneToken: string | null): boolean {
  if (typeof headerValue !== 'string') return false;
  return secretMatches(headerValue, paneToken);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // A browser page must never be able to read this surface cross-origin.
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Zod's `issues` array if this is a ZodError, otherwise a single synthetic issue. */
function issuesOf(err: unknown): unknown[] {
  const issues = (err as { issues?: unknown })?.issues;
  if (Array.isArray(issues)) return issues;
  return [{ path: [], message: err instanceof Error ? err.message : String(err) }];
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The published registry: every exposed channel, in dot-form, with the JSON
 * Schema projected from its own Zod schema and the policy an agent needs.
 */
export function listVerbs(defs: ReadonlyMap<string, HandlerDef<unknown, unknown>>): VerbInfo[] {
  const out: VerbInfo[] = [];
  for (const [channel, def] of defs) {
    if (!isExposed(channel)) continue;
    const verb = toVerb(channel);
    if (!verb) continue;
    const { schema, wrapped } = toToolInputSchema(def.input);
    out.push({
      verb,
      channel,
      hasSchema: Boolean(def.input),
      inputSchema: schema,
      payloadWrapped: wrapped,
      gated: isGated(verb),
      requiresEngine: requiresEngine(verb),
      description: describeVerb(verb),
    });
  }
  return out.sort((a, b) => a.verb.localeCompare(b.verb));
}

export interface ControlSurface {
  start(): Promise<ControlSurfaceInfo>;
  stop(): Promise<void>;
  /** Synchronous teardown for `will-quit`, where async work is not awaited. */
  stopSync(): void;
  readonly info: ControlSurfaceInfo | null;
  readonly controlFilePath: string;
}

export function createControlSurface(options: ControlSurfaceOptions): ControlSurface {
  const controlFilePath = join(options.userDataDir, CONTROL_FILE);
  let server: Server | null = null;
  let info: ControlSurfaceInfo | null = null;

  /**
   * Resolve a verb to its handler def. Unpublished channels are invisible
   * rather than forbidden: a caller learns the surface from `/v1/verbs`, and a
   * distinct 403 would only advertise that `harness.feed` exists.
   */
  function resolve(verb: string): HandlerDef<unknown, unknown> | null {
    for (const [channel, def] of options.defs()) {
      if (!isExposed(channel)) continue;
      if (toVerb(channel) === verb) return def;
    }
    return null;
  }

  /**
   * Run one verb. The two `try` blocks are the error mapping: whatever throws
   * inside `parse` is bad input (422), whatever throws inside `handle` is a
   * refusal (409). Classifying by STAGE rather than by error type is what makes
   * a run-state lock surface with its own message intact.
   */
  async function dispatch(
    res: ServerResponse,
    verb: string,
    payload: unknown,
    isPane = false,
  ): Promise<void> {
    const def = resolve(verb);
    if (!def) {
      json(res, 404, { error: 'unknown_verb', verb });
      return;
    }

    let input: unknown;
    try {
      input = def.input ? def.input.parse(payload) : payload;
    } catch (err) {
      json(res, 422, { error: 'invalid_input', verb, issues: issuesOf(err) });
      return;
    }

    // The engine gate. Placed AFTER the schema parse deliberately: it preserves
    // the documented 422-before-409 split exactly, and it means a malformed
    // payload does not pay for a live DOM probe to be told it was malformed.
    //
    // 409 rather than a new code, because this IS the existing category — "you
    // may not do that right now" — and an agent already knows not to improvise
    // around a 409. The hint travels in `message`, where a client that only
    // knows the old shape still surfaces it verbatim.
    if (requiresEngine(verb)) {
      const readiness = await options.engineReadiness?.();
      if (!readiness?.ready) {
        const message = readiness?.hint ?? UNKNOWN_ENGINE_MESSAGE;
        options.logger?.info(
          { verb, state: readiness?.state ?? 'unknown' },
          'control surface refused: engine not ready',
        );
        json(res, 409, {
          error: 'engine_not_ready',
          verb,
          message,
          engine: readiness ?? { ready: false, state: 'indeterminate', hint: message },
        });
        return;
      }
    }

    // ── D1: the human gate ──
    //
    // LAST of the three gates, and the order is load-bearing. A malformed
    // payload (422) and an unready engine (409) are both answers we can give
    // without troubling anybody — and asking a human to approve a run that is
    // about to fail because ChatGPT is signed out spends their attention to
    // produce an error. Never raise a dialog for a call that cannot succeed.
    //
    // Only the PANE is held. Every other client keeps the advisory behaviour,
    // which is what leaves `chat:probe` headless and leaves an agent driving
    // the surface directly un-blocked — there is no human at those.
    if (isPane && isGated(verb)) {
      if (isPaneDenied(verb)) {
        // Not "ask the human" — this one is refused outright, because a
        // confirm cannot convey what it would actually do. See PANE_DENIED_VERBS.
        options.logger?.warn({ verb }, 'control surface refused: verb is denied to the pane');
        json(res, 403, {
          error: 'forbidden_for_pane',
          verb,
          message:
            `${verb} cannot be called from the in-app chat, with or without approval. ` +
            'It carries a known defect that a yes/no confirm cannot describe honestly. ' +
            'Tell the user it must be done by hand, and why.',
        });
        return;
      }

      let allowed = false;
      try {
        // No confirm channel means no reachable human, and the pane's whole
        // premise is that one is sitting there. Absent consent is not consent.
        allowed = options.confirmGated
          ? await options.confirmGated({ verb, payload: input, description: describeVerb(verb) })
          : false;
      } catch (err) {
        // A confirm that THREW told us nothing about what the human wants.
        allowed = false;
        options.logger?.warn({ verb, err: messageOf(err) }, 'gate confirm failed — denying');
      }

      if (!allowed) {
        options.logger?.info({ verb }, 'control surface refused: human declined the gated verb');
        json(res, 403, {
          error: 'confirm_denied',
          verb,
          message:
            `The user did not approve ${verb}. This is a final answer, not a transient ` +
            'failure — do NOT retry it and do not look for another way to achieve it. ' +
            'Tell them it was declined and ask what they want instead.',
        });
        return;
      }
      options.logger?.info({ verb }, 'gated verb approved by the human');
    }

    let result: unknown;
    try {
      result = await def.handle(input);
    } catch (err) {
      // Handler refusals are the run-state locks, and their wording is the
      // whole point: it is what the agent relays to the user instead of
      // improvising a workaround.
      options.logger?.info({ verb, message: messageOf(err) }, 'control surface refused');
      json(res, 409, { error: 'refused', verb, message: messageOf(err) });
      return;
    }

    json(res, 200, { result: result ?? null });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // Liveness answers before auth: a client that cannot read control.json still
    // needs to know whether anything is listening on this port at all.
    if (path === '/v1/health' && method === 'GET') {
      json(res, 200, { ok: true, version: options.version, running: options.isRunning() });
      return;
    }

    if (!info || !tokenMatches(req.headers.authorization, info.token)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    if (path === '/v1/verbs' && method === 'GET') {
      json(res, 200, { verbs: listVerbs(options.defs()) });
      return;
    }

    const isPane = isPaneRequest(req.headers[CLIENT_HEADER], options.paneToken?.() ?? null);

    if (path === '/v1/context' && method === 'GET') {
      // Dispatched through the registry so the route and `context.get` can
      // never answer differently. `context.get` is not gated, so the pane flag
      // changes nothing here — passed for uniformity, not effect.
      const verb = toVerb(CONTEXT_CHANNEL);
      await dispatch(res, verb ?? 'context.get', undefined, isPane);
      return;
    }

    if (path.startsWith('/v1/call/') && method === 'POST') {
      const verb = decodeURIComponent(path.slice('/v1/call/'.length));
      if (!verb) {
        json(res, 404, { error: 'unknown_verb', verb: '' });
        return;
      }
      const raw = (await readBody(req)).trim();
      let payload: unknown;
      if (raw !== '') {
        try {
          payload = JSON.parse(raw);
        } catch (err) {
          json(res, 422, {
            error: 'invalid_input',
            verb,
            issues: [{ path: [], message: `body is not valid JSON: ${messageOf(err)}` }],
          });
          return;
        }
      }
      await dispatch(res, verb, payload, isPane);
      return;
    }

    json(res, 404, { error: 'not_found', path });
  }

  async function publish(file: ControlFile): Promise<void> {
    // Unlink first: `mode` on writeFile is ignored for a file that already
    // exists, so a stale 0644 from an earlier build would survive silently.
    await fs.rm(controlFilePath, { force: true });
    await fs.writeFile(controlFilePath, JSON.stringify(file, null, 2), { mode: 0o600 });
    await fs.chmod(controlFilePath, 0o600);
  }

  return {
    get info() {
      return info;
    },
    controlFilePath,

    async start(): Promise<ControlSurfaceInfo> {
      if (info) return info;
      const token = randomBytes(32).toString('hex');

      server = createServer((req, res) => {
        void route(req, res).catch((err) => {
          options.logger?.warn({ err: messageOf(err) }, 'control surface internal error');
          if (!res.headersSent) json(res, 500, { error: 'internal' });
          else res.end();
        });
      });

      const resolved = await new Promise<number>((resolveListen, rejectListen) => {
        const srv = server;
        if (!srv) {
          rejectListen(new Error('control surface: server was disposed before listen'));
          return;
        }
        srv.once('error', rejectListen);
        srv.listen(resolvePort(options.port), HOST, () => {
          srv.removeListener('error', rejectListen);
          const addr = srv.address();
          resolveListen(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });

      info = { port: resolved, token };
      await publish({ ...info, pid: process.pid });
      options.logger?.info(
        { port: resolved, file: controlFilePath },
        'control surface listening on loopback',
      );
      return info;
    },

    async stop(): Promise<void> {
      const srv = server;
      server = null;
      info = null;
      await fs.rm(controlFilePath, { force: true }).catch(() => undefined);
      if (!srv) return;
      await new Promise<void>((resolveClose) => {
        srv.closeAllConnections?.();
        srv.close(() => resolveClose());
      });
    },

    stopSync(): void {
      try {
        unlinkSync(controlFilePath);
      } catch {
        // Already gone, or never written — either way there is nothing to clean.
      }
      server?.closeAllConnections?.();
      server?.close();
      server = null;
      info = null;
    },
  };
}

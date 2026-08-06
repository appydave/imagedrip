import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from '@appydave/core';
import type { HandlerDef } from '../src/main/ipc-router';
import { createControlSurface, type ControlSurface } from '../src/main/control-surface';
// @ts-expect-error — plain ESM, JSDoc-typed; see tsconfig.scripts.json
import { toTool, toToolResult, toolName, toPayload } from '../scripts/imagedrip-mcp.mjs';

/**
 * The MCP proxy driven as a real subprocess over stdio, against a real control
 * surface. Spawning it rather than importing it is the point: the JSON-RPC
 * framing, the stdout discipline (protocol frames only) and the control.json
 * discovery are exactly what a client depends on and what a unit test of the
 * pure helpers would not touch.
 */

const userData = mkdtempSync(join(tmpdir(), 'imagedrip-mcp-'));
let running = false;

const defs = new Map<string, HandlerDef<unknown, unknown>>();
function def<In, Out>(d: HandlerDef<In, Out>): void {
  defs.set(d.channel, d as unknown as HandlerDef<unknown, unknown>);
}
def<void, { activeProjectId: string }>({
  channel: 'imagedrip:domain:get',
  handle: () => ({ activeProjectId: 'spring-nails' }),
});
def<{ name: string }, { id: string }>({
  channel: 'imagedrip:project:create',
  input: z.object({ name: z.string().min(1) }),
  handle: ({ name }) => ({ id: name.toLowerCase().replace(/\s+/g, '-') }),
});
def<string, string>({
  channel: 'imagedrip:project:switch',
  input: z.string().min(1),
  handle: (id) => id,
});
def<{ name?: string }, void>({
  channel: 'imagedrip:domain:save-brand',
  input: z.object({ name: z.string().optional() }),
  handle: () => {
    if (running) throw new Error('brand is locked while a run is live');
  },
});
def<void, void>({ channel: 'imagedrip:run:start', handle: () => undefined });
def<string, void>({
  channel: 'imagedrip:harness:feed',
  input: z.string(),
  handle: () => undefined,
});

let surface: ControlSurface;
let proc: ChildProcess;
let nextId = 1;
let buffer = '';
const pending = new Map<number, (msg: any) => void>();

function rpc(method: string, params?: unknown): Promise<any> {
  const id = nextId++;
  return new Promise((resolveRpc, rejectRpc) => {
    const timer = setTimeout(() => rejectRpc(new Error(`${method} timed out`)), 15000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolveRpc(msg);
    });
    proc.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

beforeAll(async () => {
  surface = createControlSurface({
    defs: () => defs,
    userDataDir: userData,
    version: '0.1.0-test',
    isRunning: () => running,
    port: 0,
  });
  await surface.start();

  proc = spawn(process.execPath, [resolve(__dirname, '..', 'scripts', 'imagedrip-mcp.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, IMAGEDRIP_CONTROL_FILE: surface.controlFilePath },
  });
  proc.stdout!.setEncoding('utf8');
  proc.stdout!.on('data', (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
}, 30000);

afterAll(async () => {
  proc?.kill();
  await surface.stop();
});

describe('MCP handshake', () => {
  it('initializes and declares tools', async () => {
    const res = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(res.result.serverInfo.name).toBe('imagedrip');
    expect(res.result.capabilities.tools).toBeTruthy();
    expect(res.result.protocolVersion).toBe('2025-06-18');
  });

  it('answers ping', async () => {
    const res = await rpc('ping');
    expect(res.result).toEqual({});
  });

  it('reports an unknown method as a JSON-RPC error', async () => {
    const res = await rpc('resources/list');
    expect(res.error.code).toBe(-32601);
  });
});

describe('tools/list — everything is copied from the surface, nothing decided here', () => {
  it('exposes one tool per published verb', async () => {
    const res = await rpc('tools/list');
    const names: string[] = res.result.tools.map((t: any) => t.name);
    expect(names).toContain('domain_get');
    expect(names).toContain('project_create');
    expect(names).toContain('run_start');
  });

  it('has no tool that could write to the ChatGPT webview', async () => {
    const res = await rpc('tools/list');
    const names: string[] = res.result.tools.map((t: any) => t.name);
    // The proxy cannot publish what the surface refuses to publish.
    expect(names.some((n) => n.startsWith('harness'))).toBe(false);
  });

  it('marks a gated tool CONFIRM-FIRST in its description', async () => {
    const res = await rpc('tools/list');
    const start = res.result.tools.find((t: any) => t.name === 'run_start');
    expect(start.description).toMatch(/CONFIRM-FIRST/);
    expect(start.description).toMatch(/never call it on your own initiative/i);
  });

  it('carries an object inputSchema for every tool, including scalar verbs', async () => {
    const res = await rpc('tools/list');
    for (const t of res.result.tools) expect(t.inputSchema.type).toBe('object');
    const sw = res.result.tools.find((t: any) => t.name === 'project_switch');
    expect(sw.inputSchema.properties.payload).toEqual({ type: 'string', minLength: 1 });
  });
});

describe('tools/call — every tool resolves to a fetch()', () => {
  it('proxies a read', async () => {
    const res = await rpc('tools/call', { name: 'domain_get', arguments: {} });
    expect(res.result.isError).toBeFalsy();
    expect(JSON.parse(res.result.content[0].text).activeProjectId).toBe('spring-nails');
  });

  it('proxies an object payload', async () => {
    const res = await rpc('tools/call', {
      name: 'project_create',
      arguments: { name: 'Spring Nails' },
    });
    expect(JSON.parse(res.result.content[0].text).id).toBe('spring-nails');
  });

  it('unwraps the payload envelope for a scalar verb', async () => {
    const res = await rpc('tools/call', {
      name: 'project_switch',
      arguments: { payload: 'spring-nails' },
    });
    expect(JSON.parse(res.result.content[0].text)).toBe('spring-nails');
  });

  it('surfaces a refusal as isError, with the lock message intact', async () => {
    running = true;
    try {
      const res = await rpc('tools/call', { name: 'domain_save-brand', arguments: { name: 'X' } });
      expect(res.result.isError).toBe(true);
      // The agent must be able to relay the rule, and must not retry it.
      expect(res.result.content[0].text).toMatch(/brand is locked while a run is live/);
      expect(res.result.content[0].text).toMatch(/do not work around it/i);
    } finally {
      running = false;
    }
  });

  it('surfaces invalid input as a correctable error', async () => {
    const res = await rpc('tools/call', { name: 'project_create', arguments: { name: '' } });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/INVALID INPUT/);
  });

  it('reports an unknown tool without pretending to succeed', async () => {
    const res = await rpc('tools/call', { name: 'not_a_tool', arguments: {} });
    expect(res.result.isError).toBe(true);
  });
});

describe('pure helpers', () => {
  it('maps a dotted verb to a legal MCP tool name', () => {
    expect(toolName('domain.import-prompts')).toBe('domain_import-prompts');
    expect(toolName('run.start')).toBe('run_start');
  });

  it('keeps the verb visible in the description, so nothing is lost in translation', () => {
    const t = toTool({ verb: 'template.create', description: 'Create a template.', gated: false, inputSchema: {} });
    expect(t.description).toMatch(/ImageDrip verb: template\.create/);
  });

  it('unwraps only when the surface said the payload was wrapped', () => {
    expect(toPayload({ payloadWrapped: true }, { payload: 'x' })).toBe('x');
    expect(toPayload({ payloadWrapped: false, hasSchema: true }, { a: 1 })).toEqual({ a: 1 });
  });

  it('renders a 404 as "this cannot be done", not as a transient failure', () => {
    const out = toToolResult({ status: 404, body: { error: 'unknown_verb', verb: 'x' } });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/NO SUCH VERB/);
  });
});

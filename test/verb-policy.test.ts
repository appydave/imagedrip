import { describe, it, expect } from 'vitest';
import { z } from '@appydave/core';
import {
  describeVerb,
  isExposed,
  isGated,
  requiresEngine,
  toVerb,
  ENGINE_REQUIRED_VERBS,
  GATED_VERBS,
  NEVER_EXPOSED,
  VERB_DOCS,
} from '../src/main/verb-policy';
import { toJsonSchema, toToolInputSchema } from '../src/main/zod-to-json-schema';

describe('toVerb', () => {
  it('strips the namespace and dot-joins the rest', () => {
    expect(toVerb('imagedrip:template:create')).toBe('template.create');
    expect(toVerb('imagedrip:domain:import-prompts')).toBe('domain.import-prompts');
    expect(toVerb('imagedrip:context:get')).toBe('context.get');
  });

  it('refuses anything outside the ImageDrip namespace', () => {
    expect(toVerb('app:info')).toBeNull();
    expect(toVerb('counter:get')).toBeNull();
    expect(toVerb('imagedrip:')).toBeNull();
  });
});

describe('exposure — v4 §4, the hard constraint', () => {
  it('never publishes a channel that writes to the ChatGPT webview', () => {
    // The CadenceEngine owns that session exclusively; a second writer voids
    // the ToS mitigation the whole app is built on.
    for (const channel of NEVER_EXPOSED) expect(isExposed(channel)).toBe(false);
    expect(isExposed('imagedrip:harness:feed')).toBe(false);
    expect(isExposed('imagedrip:run:inject-primer')).toBe(false);
    expect(isExposed('imagedrip:run:inject-prompt')).toBe(false);
  });

  it('does publish the sanctioned run verbs — asking the harness to run is allowed', () => {
    expect(isExposed('imagedrip:run:start')).toBe(true);
    expect(isExposed('imagedrip:run:stop')).toBe(true);
  });

  it('excludes the AppyTron scaffold channels', () => {
    expect(isExposed('app:info')).toBe(false);
    expect(isExposed('app:ping')).toBe(false);
    expect(isExposed('counter:get')).toBe(false);
  });

  it('publishes the config verbs an agent actually needs', () => {
    for (const channel of [
      'imagedrip:domain:get',
      'imagedrip:domain:import-prompts',
      'imagedrip:template:create',
      'imagedrip:project:create',
      'imagedrip:context:get',
    ]) {
      expect(isExposed(channel)).toBe(true);
    }
  });
});

describe('gating — v4 §6.2', () => {
  it('gates everything that feeds the live session or destroys work', () => {
    expect(isGated('run.start')).toBe(true);
    expect(isGated('run.stop')).toBe(true);
    expect(isGated('run.pause')).toBe(true);
    expect(isGated('run.resume')).toBe(true);
    expect(isGated('domain.reset-run')).toBe(true);
    expect(isGated('project.choose-output-dir')).toBe(true);
  });

  it('leaves configuration free, or the chat is useless', () => {
    expect(isGated('domain.get')).toBe(false);
    expect(isGated('domain.import-prompts')).toBe(false);
    expect(isGated('template.create')).toBe(false);
    expect(isGated('project.create')).toBe(false);
  });

  it('every gated verb says CONFIRM-FIRST in its description', () => {
    for (const verb of GATED_VERBS) {
      expect(describeVerb(verb).toUpperCase()).toContain('CONFIRM-FIRST');
    }
  });
});

describe('descriptions', () => {
  it('tells an agent WHEN to call, not just what', () => {
    // The run gate is the one that must not read as a neutral capability.
    expect(describeVerb('run.start')).toMatch(/never call this on your own initiative/i);
    expect(describeVerb('context.get')).toMatch(/FIRST/);
    // A stale context must be described as an answer, not a failure.
    expect(describeVerb('context.get')).toMatch(/not an error/i);
  });

  it('falls back to a usable line for a verb nobody documented', () => {
    expect(describeVerb('brand.new-thing')).toMatch(/brand\.new-thing/);
    expect(describeVerb('brand.new-thing')).toMatch(/422/);
  });

  it('documents the interactive verb as unable to succeed headlessly', () => {
    expect(describeVerb('project.choose-output-dir')).toMatch(/headlessly/);
    expect(VERB_DOCS['project.choose-output-dir']).toBeTruthy();
  });
});

describe('toJsonSchema — a projection of the SAME Zod schema, never a second one', () => {
  it('projects an object with required and optional keys', () => {
    const schema = toJsonSchema(
      z.object({
        text: z.string(),
        mode: z.enum(['replace', 'add', 'clear']),
        format: z.enum(['lines', 'blocks']).optional(),
      }),
    );
    expect(schema.type).toBe('object');
    expect((schema.required as string[]).sort()).toEqual(['mode', 'text']);
    expect((schema.properties as any).format.enum).toEqual(['lines', 'blocks']);
  });

  it('carries string and number constraints', () => {
    expect(toJsonSchema(z.string().min(1))).toEqual({ type: 'string', minLength: 1 });
    expect(toJsonSchema(z.number().int())).toEqual({ type: 'integer' });
  });

  it('handles nullable, arrays and booleans', () => {
    expect(toJsonSchema(z.string().nullable())).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
    expect(toJsonSchema(z.array(z.string()).min(1))).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    });
    expect(toJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('degrades to "any JSON" rather than inventing a constraint', () => {
    // Laxer is safe: Zod still rejects, and the 422 carries the real issues.
    expect(toJsonSchema(z.unknown())).toEqual({});
    expect(toJsonSchema(undefined)).toEqual({});
    expect(toJsonSchema({ not: 'a schema' })).toEqual({});
  });
});

describe('toToolInputSchema', () => {
  it('passes an object schema through unwrapped', () => {
    const { schema, wrapped } = toToolInputSchema(z.object({ name: z.string() }));
    expect(wrapped).toBe(false);
    expect(schema.type).toBe('object');
  });

  it('wraps a bare scalar, because MCP needs an object at the top level', () => {
    const { schema, wrapped } = toToolInputSchema(z.string().min(1));
    expect(wrapped).toBe(true);
    expect((schema.properties as any).payload).toEqual({ type: 'string', minLength: 1 });
    expect(schema.required).toEqual(['payload']);
  });

  it('gives a no-payload verb an empty object schema', () => {
    const { schema, wrapped } = toToolInputSchema(undefined);
    expect(wrapped).toBe(false);
    expect(schema).toEqual({ type: 'object', properties: {} });
  });
});

/**
 * Which verbs require a signed-in engine.
 *
 * The asymmetry here is the whole design: verbs that FEED the engine are gated,
 * verbs that STOP it never are. Gating stop would make a run un-stoppable in
 * precisely the situation the gate exists for — a batch mid-flight against a
 * page that is not the composer.
 */
describe('requiresEngine', () => {
  it('gates the verbs that feed the engine', () => {
    expect(requiresEngine('run.start')).toBe(true);
    expect(requiresEngine('run.resume')).toBe(true);
  });

  it('NEVER gates the verbs that halt a run', () => {
    expect(requiresEngine('run.stop')).toBe(false);
    expect(requiresEngine('run.pause')).toBe(false);
  });

  it('leaves read-only and config verbs reachable on a signed-out machine', () => {
    // A machine that has never signed in can still be configured and have
    // prompts written into its queue — that is most of the value of reaching
    // the app from a chat, and over-gating would throw it away.
    for (const verb of [
      'context.get',
      'domain.get',
      'domain.import-prompts',
      'template.save',
      'project.create',
      'run.chat-state',
      'runs.manifest',
    ]) {
      expect(requiresEngine(verb)).toBe(false);
    }
  });

  it('is false for an unknown verb — the list is explicit, never inferred', () => {
    expect(requiresEngine('nonsense.verb')).toBe(false);
  });

  it('every engine-required verb is also confirm-first', () => {
    // Feeding a live paid session should never be reachable without a human
    // yes, independent of whether the engine happens to be up.
    for (const verb of ENGINE_REQUIRED_VERBS) {
      expect(GATED_VERBS).toContain(verb);
    }
  });

  it('documents the precondition on every gated verb it applies to', () => {
    // An agent reads these to decide its next move; a gate it cannot see in the
    // docs becomes a surprise 409 mid-plan.
    for (const verb of ENGINE_REQUIRED_VERBS) {
      expect(VERB_DOCS[verb]).toMatch(/engine/i);
    }
  });
});

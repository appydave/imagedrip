/**
 * A best-effort projection of a Zod schema into JSON Schema, for tool declarations.
 *
 * **This is a projection, never a second source of truth.** The authoritative
 * contract stays the `def.input` schema the renderer is already held to (v4
 * §9.1 property 2); this only exists because MCP tools need an `inputSchema` and
 * the pinned Zod here is v3 (3.25.x), which has no `toJSONSchema()`.
 *
 * Consequences of it being a projection, and why they are safe:
 *   - Anything it cannot read degrades to `{}` — "any JSON" — rather than
 *     inventing a constraint the real schema does not have.
 *   - It can only ever be *laxer* than Zod, so a payload it accepts and Zod
 *     rejects comes back as a 422 carrying the real issues. The agent corrects
 *     from the authoritative error, not from this file.
 *
 * Reads Zod v3 `_def` internals deliberately, and defensively: every access is
 * optional and every unknown `typeName` falls through to `{}`.
 */

import type { z } from '@appydave/core';

/** Minimal shape of the Zod v3 internals this reads. */
interface ZodDef {
  typeName?: string;
  shape?: () => Record<string, unknown>;
  innerType?: unknown;
  type?: unknown;
  values?: unknown;
  value?: unknown;
  options?: unknown;
  checks?: { kind?: string; value?: unknown }[];
  valueType?: unknown;
  // Arrays carry their bounds as their own fields, NOT in `checks` like strings
  // and numbers do — reading `checks` for an array silently drops minItems.
  minLength?: { value?: unknown } | null;
  maxLength?: { value?: unknown } | null;
}

function defOf(schema: unknown): ZodDef | null {
  if (!schema || typeof schema !== 'object') return null;
  const def = (schema as { _def?: unknown })._def;
  if (!def || typeof def !== 'object') return null;
  return def as ZodDef;
}

/** True when the schema tolerates `undefined` — i.e. the key is not required. */
function isOptional(schema: unknown): boolean {
  const def = defOf(schema);
  const name = def?.typeName;
  return name === 'ZodOptional' || name === 'ZodDefault' || name === 'ZodVoid' || name === 'ZodUndefined';
}

/**
 * Project one schema. Returns `{}` (any JSON) for anything unrecognised —
 * see the header: laxer is safe, inventing constraints is not.
 */
export function toJsonSchema(schema: unknown): Record<string, unknown> {
  const def = defOf(schema);
  if (!def) return {};

  switch (def.typeName) {
    case 'ZodString': {
      const out: Record<string, unknown> = { type: 'string' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min' && typeof check.value === 'number') out.minLength = check.value;
        if (check.kind === 'max' && typeof check.value === 'number') out.maxLength = check.value;
      }
      return out;
    }
    case 'ZodNumber': {
      const out: Record<string, unknown> = { type: 'number' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'int') out.type = 'integer';
        if (check.kind === 'min' && typeof check.value === 'number') out.minimum = check.value;
        if (check.kind === 'max' && typeof check.value === 'number') out.maximum = check.value;
      }
      return out;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return Array.isArray(def.values) ? { type: 'string', enum: [...def.values] } : { type: 'string' };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodArray': {
      const out: Record<string, unknown> = { type: 'array', items: toJsonSchema(def.type) };
      if (typeof def.minLength?.value === 'number') out.minItems = def.minLength.value;
      if (typeof def.maxLength?.value === 'number') out.maxItems = def.maxLength.value;
      return out;
    }
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value);
        if (!isOptional(value)) required.push(key);
      }
      const out: Record<string, unknown> = { type: 'object', properties };
      if (required.length) out.required = required;
      return out;
    }
    case 'ZodOptional':
    case 'ZodDefault':
      return toJsonSchema(def.innerType);
    case 'ZodNullable': {
      const inner = toJsonSchema(def.innerType);
      return Object.keys(inner).length ? { anyOf: [inner, { type: 'null' }] } : {};
    }
    case 'ZodUnion':
      return Array.isArray(def.options) ? { anyOf: def.options.map(toJsonSchema) } : {};
    case 'ZodRecord':
      return { type: 'object', additionalProperties: toJsonSchema(def.valueType) };
    default:
      return {};
  }
}

/**
 * The `inputSchema` for one verb's MCP tool.
 *
 * MCP requires an object schema at the top level, but several ImageDrip verbs
 * take a bare scalar (`project.switch` takes a string id) or nothing at all. A
 * scalar is therefore wrapped in `{ payload: <schema> }`, and the proxy unwraps
 * it — the wrapper is a transport detail of MCP, not a second contract.
 */
export function toToolInputSchema(
  input: z.ZodType<unknown> | undefined,
): { schema: Record<string, unknown>; wrapped: boolean } {
  if (!input) return { schema: { type: 'object', properties: {} }, wrapped: false };
  const projected = toJsonSchema(input);
  if (projected.type === 'object') return { schema: projected, wrapped: false };
  return {
    schema: {
      type: 'object',
      properties: { payload: projected },
      required: isOptional(input) ? [] : ['payload'],
    },
    wrapped: true,
  };
}

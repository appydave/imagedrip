/**
 * A projection of a Zod schema into JSON Schema, for tool declarations.
 *
 * **This is a projection, never a second source of truth.** The authoritative
 * contract stays the `def.input` schema the renderer is already held to (v4
 * §9.1 property 2); this only exists because MCP tools need an `inputSchema`.
 *
 * Since @appydave/core 0.2.0 the pinned Zod is v4, so Zod projects its own
 * schemas (`z.toJSONSchema`). This replaced a hand-written reader of Zod v3
 * `_def` internals, which under v4 silently projected every schema to `{}`.
 *
 *   - `io: 'input'` describes what a CALLER may send: a `.default()`ed field is
 *     optional, not required.
 *   - `unrepresentable: 'any'` keeps the old rule that anything without a JSON
 *     Schema form degrades to `{}` — "any JSON" — rather than throwing. Laxer
 *     is safe: a payload this accepts and Zod rejects comes back as a 422
 *     carrying the real issues, and the agent corrects from that.
 *   - Two pieces of Zod's output are trimmed because they are artefacts, not
 *     constraints anyone wrote: the top-level `$schema` URI, and the
 *     ±`Number.MAX_SAFE_INTEGER` bounds Zod adds to every `.int()`. Without the
 *     trim the published tool schemas would change for no reason.
 */

import { z } from "@appydave/core";

const SAFE_INT_BOUND = Number.MAX_SAFE_INTEGER;

/** Drop Zod's `.int()` safe-integer bounds, everywhere in the tree. */
function trimSafeIntBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(trimSafeIntBounds);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "minimum" && value === -SAFE_INT_BOUND) continue;
    if (key === "maximum" && value === SAFE_INT_BOUND) continue;
    out[key] = trimSafeIntBounds(value);
  }
  return out;
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return (
    Boolean(schema) &&
    typeof schema === "object" &&
    "_zod" in (schema as object)
  );
}

/** True when the schema tolerates `undefined` — i.e. the key is not required. */
function isOptional(schema: z.ZodType): boolean {
  return schema.safeParse(undefined).success;
}

/**
 * Project one schema. Returns `{}` (any JSON) for anything that is not a Zod
 * schema or that Zod cannot project — see the header: laxer is safe.
 */
export function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (!isZodSchema(schema)) return {};
  try {
    const { $schema: _uri, ...projected } = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    });
    return trimSafeIntBounds(projected) as Record<string, unknown>;
  } catch {
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
export function toToolInputSchema(input: z.ZodType<unknown> | undefined): {
  schema: Record<string, unknown>;
  wrapped: boolean;
} {
  if (!input)
    return { schema: { type: "object", properties: {} }, wrapped: false };
  const projected = toJsonSchema(input);
  if (projected.type === "object") return { schema: projected, wrapped: false };
  return {
    schema: {
      type: "object",
      properties: { payload: projected },
      required: isOptional(input) ? [] : ["payload"],
    },
    wrapped: true,
  };
}

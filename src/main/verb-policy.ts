/**
 * Verb policy — what the control surface publishes, and how it is described.
 *
 * The control surface mirrors `IpcRouter`'s registry rather than re-declaring
 * routes (v4 §9.1), so this file holds the three things a mirror cannot derive
 * from a channel name alone:
 *
 *   1. **naming**  — `imagedrip:template:create` → `template.create`
 *   2. **policy**  — which channels are NEVER published, and which are gated
 *   3. **docs**    — WHEN an agent should reach for a verb, not just what it is
 *
 * It is deliberately separate from `control-surface.ts`: the surface is
 * transport, this is policy, and WP2's MCP proxy is allowed to be literally
 * zero-logic precisely because the policy travels with the registry over HTTP.
 */

/** One published verb, as `/v1/verbs` returns it. */
export interface VerbInfo {
  /** Dot-form name, e.g. `template.create`. */
  verb: string;
  /** The backing IPC channel, e.g. `imagedrip:template:create`. */
  channel: string;
  /** Whether a Zod schema validates the payload. */
  hasSchema: boolean;
  /**
   * An MCP-ready object schema, projected from that same Zod schema (never a
   * second source of truth). Always an object at the top level, because MCP
   * requires one — see `payloadWrapped`.
   */
  inputSchema: Record<string, unknown>;
  /**
   * True when the verb takes a bare scalar (e.g. `project.switch` takes a
   * string id) and `inputSchema` therefore wraps it as `{ payload }`. The
   * wrapper is a transport detail of MCP; a client unwraps before POSTing.
   * Published here so the MCP proxy needs no logic of its own to know.
   */
  payloadWrapped: boolean;
  /**
   * Confirm-first (v4 §6.2). Anything that feeds the live ChatGPT session or
   * destroys work. Declared so an agent can see it; never auto-invoked.
   */
  gated: boolean;
  /**
   * Refused unless the ChatGPT engine is signed in and able to accept a prompt.
   * Published so an agent can see the precondition in `/v1/verbs` rather than
   * only discovering it from a 409 — and so it knows to read `context.get`'s
   * `engine` before promising the user a batch.
   */
  requiresEngine: boolean;
  /** When to call it, and when not to. */
  description: string;
}

/** Only `imagedrip:*` channels are candidates — `app:*` and `counter:*` are scaffold. */
const NAMESPACE = 'imagedrip:';

/**
 * NEVER published, at any tier.
 *
 * v4 §4, the hard constraint: *the operator chat must never touch the ChatGPT
 * webview.* ImageDrip's whole ToS mitigation is that prompts arrive through the
 * real Chromium input pipeline at a human cadence, one at a time, with a live
 * STOP — and the CadenceEngine owns that pipeline exclusively. A second writer
 * voids the guarantee, and the account is what is at risk.
 *
 * Every channel below is a writer on that view (or attaches/positions it), so
 * gating them is not enough: they are not exposed at all. `run.*` IS exposed —
 * asking the harness to run is the sanctioned path, and it stays confirm-first.
 */
export const NEVER_EXPOSED: readonly string[] = [
  'imagedrip:harness:attach',
  'imagedrip:harness:set-bounds',
  'imagedrip:harness:set-visible',
  'imagedrip:harness:new-conversation',
  'imagedrip:harness:feed',
  'imagedrip:harness:stop',
  // Dial-in injects type the primer / a prompt straight into the live chat.
  'imagedrip:run:inject-primer',
  'imagedrip:run:inject-prompt',
];

/**
 * Verbs that FEED the engine, and therefore require a signed-in one.
 *
 * The manual ChatGPT sign-in is the system's one human-only precondition, and a
 * human running the app sees a login wall and knows. An agent calling over the
 * control surface sees nothing — so these fail fast at the call, carrying the
 * hint, rather than starting and discovering it downstream. Downstream here is
 * not a clean error: `WebviewHarness.feed` pastes into whatever holds focus when
 * it cannot find the composer, which on a signed-out page is the login form.
 *
 * `run.stop` and `run.pause` are deliberately ABSENT, and that is not an
 * oversight. They halt the engine rather than feed it, and gating them would
 * make a run un-stoppable in exactly the situation where stopping matters most —
 * a batch mid-flight against a page that is not the composer. A guard that can
 * trap the user inside the failure is worse than no guard.
 *
 * `run.chat-state` is read-only and stays reachable, so a caller can inspect a
 * broken engine without being allowed to feed it.
 */
export const ENGINE_REQUIRED_VERBS: readonly string[] = ['run.start', 'run.resume'];

export function requiresEngine(verb: string): boolean {
  return ENGINE_REQUIRED_VERBS.includes(verb);
}

/** Confirm-first verbs (v4 §6.2), in dot-form. */
export const GATED_VERBS: readonly string[] = [
  'run.start',
  'run.stop',
  'run.pause',
  'run.resume',
  // "prompts.clear" is `domain:import-prompts` with mode 'clear'; the destructive
  // reset of an entire queue is its own channel and gated on its own.
  'domain.reset-run',
  'project.choose-output-dir',
];

/**
 * `imagedrip:template:create` → `template.create`.
 * Returns null for anything outside the ImageDrip namespace.
 */
export function toVerb(channel: string): string | null {
  if (!channel.startsWith(NAMESPACE)) return null;
  const rest = channel.slice(NAMESPACE.length);
  if (!rest) return null;
  return rest.split(':').join('.');
}

/** Whether a registered channel is published on the control surface at all. */
export function isExposed(channel: string): boolean {
  if (!channel.startsWith(NAMESPACE)) return false;
  if (NEVER_EXPOSED.includes(channel)) return false;
  return toVerb(channel) !== null;
}

export function isGated(verb: string): boolean {
  return GATED_VERBS.includes(verb);
}

/**
 * When to call each verb. Written for an agent deciding its next move, which is
 * why several say what NOT to do — a description that only says what a verb is
 * gets called at the wrong moment.
 *
 * Any verb without an entry still publishes; it just gets a generic line. That
 * keeps the surface honest when a channel is added and this table is not.
 */
export const VERB_DOCS: Readonly<Record<string, string>> = {
  'context.get':
    'Call FIRST, before anything else, every session. Returns the brand, template, project, mode and run ImageDrip is currently pointed at, so "add twelve more like the last lot" resolves. It expires ~5 minutes after the last human interaction and then returns {active:false, hint} — that is a normal answer, not an error: relay the hint and ask the user rather than guessing a target.',
  'domain.get':
    'The whole domain document: active brand, template, project, the prompt queue and every switcher list. Use it to read the house style before writing prompts, and to verify a write landed. Every mutating verb also returns this, so you rarely need a follow-up read.',
  'domain.import-prompts':
    'Put prompts into the QUEUED pane. mode "add" appends after the existing queue, "replace" drops queued items (harvested ones always survive), "clear" empties the queue and imports nothing. format "lines" is one prompt per line; "blocks" splits on a line containing only ---. Read the Template first: its importFormat is the intended cut for that artifact kind. This is the verb that finishes the job the embedded ChatGPT cannot.',
  'domain.save-project':
    'Edit the ACTIVE project: name, body (the SUBJECT layer of the primer), or outputDir. Refused with 409 while a run is live if you try to move outputDir. Ask the user before changing outputDir — it decides where images land.',
  'domain.save-brand':
    'Edit the ACTIVE brand body (the LOOK layer). Locked while a run is live and answers 409 — do not retry, tell the user the run must stop first. A brand sourced from a repo DESIGN.md is canonical elsewhere; prefer proposing the change over writing it.',
  'domain.compose-primer':
    'Read-only preview of the exact text that would be posted to ChatGPT: compose(Brand, Template, Project). Use it to show the user what a run would say before asking to start one. Writes nothing.',
  'domain.reset-run':
    'DESTRUCTIVE and confirm-first: re-queues every prompt so the theme can run again. Ask first, every time.',
  'brand.create': 'Create and activate a new brand. Refused with 409 while a run is live.',
  'brand.switch':
    'Activate a saved brand by id (from domain.get -> brands). Refused with 409 while a run is live.',
  'template.create':
    'Create a template — the ARTIFACT KIND (character sheet, storyboard, catalogue tile), reusable across brands and projects. Give importFormat so imports cut correctly. Then use template.save to write its body, listPrompt and negatives, and template.switch to point the active project at it. Refused with 409 while a run is live.',
  'template.switch':
    'Point the ACTIVE project at a template by id, or null for none. Refused with 409 while a run is live.',
  'template.save':
    'Write the active template: body (the recipe), negatives (hard constraints — prefer putting rules here rather than repeating them in every prompt), listPrompt, importFormat, name. Refused with 409 while a run is live.',
  'project.create':
    'Create and activate a project — the SUBJECT layer. outputDir is optional and defaults to ~/Pictures/ImageDrip/<slug>; pass it when the user names a destination.',
  'project.switch':
    'Activate a saved project by id. Refused with 409 while a run is live, because it repoints where images are written.',
  'project.choose-output-dir':
    'Confirm-first and INTERACTIVE: opens a native folder picker in front of the user. It cannot succeed headlessly and it needs a human at the window. To set a destination you already know, use domain.save-project with outputDir instead.',
  'project.reveal-output-dir': "Open the active project's output folder in Finder.",
  'runs.list': "Past runs of the ACTIVE project, newest state included — read before claiming what has or has not been generated.",
  'runs.manifest':
    'The full record of one run: the exact primer as posted, every prompt with its outcome and timing, re-primes and pauses. This is the provenance source — quote it rather than recomposing a primer, which would attribute an image to text it was never generated from.',
  'runs.reveal': "Open one run's folder in Finder.",
  'run.start':
    'CONFIRM-FIRST — never call this on your own initiative. It begins feeding a live, logged-in ChatGPT session at a human cadence. Ask the user explicitly and get a yes for THIS run. It also REQUIRES a signed-in engine: check context.get -> engine.ready first, and if it is false relay engine.hint to the user rather than calling this and hoping. Calling against an unready engine is refused with 409 and that same hint.',
  'run.stop':
    'CONFIRM-FIRST. Halts an in-flight batch the user is paying for. Ask first. Always reachable, even when the engine is unready — stopping must never be blocked by the condition you are stopping because of.',
  'run.pause': 'CONFIRM-FIRST. Interrupts an in-flight batch. Ask first. Always reachable.',
  'run.resume':
    'CONFIRM-FIRST. Resumes a paused batch. Ask first. Like run.start, requires a signed-in engine and is refused with 409 + hint otherwise.',
  'run.chat-state':
    'Read-only: is the live conversation already primed? Decides whether a run should continue in this chat or start a fresh one. Safe to call. Note it reports the RUNNER\'s view, not the browser\'s — for "is the engine signed in and usable at all", read context.get -> engine.',
  'harvest.thumb': 'Read one harvested image as a data URL, by path relative to the harvest root.',
  'uat.snag': 'Record a Live UAT note about cockpit friction. Capture only — changes nothing.',
  'uat.verdict': 'Record a judgment on harvested images. Capture only — changes nothing.',
  'uat.counts': 'How many Live UAT snags and verdicts have been captured.',
  'uat.reveal': 'Open the Live UAT corpus folder in Finder.',
};

export function describeVerb(verb: string): string {
  const doc = VERB_DOCS[verb];
  if (doc) return doc;
  return `ImageDrip verb ${verb}. Payload is validated server-side; a 422 response carries the exact Zod issues to correct.`;
}

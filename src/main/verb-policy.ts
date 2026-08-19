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
  /**
   * WP4 — the operator chat's OWN controls.
   *
   * A different hazard from the webview ones above, and worth stating: these
   * are not dangerous to the ChatGPT session, they are dangerous to the
   * containment. Publishing `chat.send` would hand the contained agent a tool
   * that prompts itself — an unbounded loop on David's subscription — and would
   * let any control-surface client drive the pane's CLI, which is exactly the
   * client the D1 gate exists to tell apart from the others.
   *
   * The pane reaches these over IPC, like every other renderer-only channel.
   */
  'imagedrip:chat:send',
  'imagedrip:chat:state',
  'imagedrip:chat:stop',
  /**
   * 🔴 The D1 answer channel — added 2026-08-11, and it was published for
   * three days before anyone noticed.
   *
   * This is how the RENDERER tells main that a human clicked Allow or Deny.
   * Publishing it put **the tool that answers a security prompt on the surface
   * the prompt is protecting against** — and worse, `chat-session.ts` builds
   * the pane's allow-list from everything not in `PANE_DENIED_VERBS`, so the
   * contained agent D1 exists to constrain was handed `chat_gate-decide` by
   * name.
   *
   * It was not directly exploitable: `decide(id, allow)` ignores anything that
   * does not match the pending request's `randomUUID`, and that id is pushed
   * only to the renderer. But the margin was one log line wide. The gate
   * already logs an id on a mismatched answer, `file-log.ts` writes to
   * `userData`, and `userData` is the pane CLI's own cwd when no brand repo is
   * attached — a directory it has Read on. A live id reaching that file at any
   * point turns this into self-approval.
   *
   * This is `agent-safety.md` §2 exactly: the thing being constrained must not
   * hold the control that constrains it.
   *
   * ── The systemic half ──
   * Nobody added this deliberately. The control surface mirrors the IPC
   * registry, so **exposure is opt-OUT**: any new `imagedrip:*` channel is
   * agent-facing the moment it is registered, unless someone remembers this
   * list. That default is convenient and it is backwards for anything
   * security-relevant. `test/verb-policy.test.ts` now pins the published set,
   * so a new channel fails the suite until its exposure is decided on purpose.
   */
  'imagedrip:chat:gate-decide',
  /**
   * The four PUSH channels — main → renderer, via `webContents.send`.
   *
   * These are not verbs and never were: nothing registers a handler on them,
   * so `listVerbs` has never published them. They are listed anyway because
   * `isExposed()` said **true** for all four, and "safe because nobody
   * registered a handler yet" is an accident, not a policy. The moment someone
   * adds a handler on one — to let a client pull the last status, say — it
   * becomes an agent-facing verb with no decision having been made.
   *
   * Saying it out loud costs one line each and makes the policy answer
   * truthfully for every channel the app declares, which is what lets the
   * pinned-set test below use the whole `IPC` map as its population.
   */
  'imagedrip:run:status',
  'imagedrip:harness:event',
  'imagedrip:chat:event',
  'imagedrip:chat:gate',
  /**
   * ── The native file pickers — unpublished 2026-08-11 ──
   *
   * These are the third hazard on this list and the least obvious: they are not
   * dangerous at all. They simply **cannot work**.
   *
   * Both call `dialog.showOpenDialog`, which needs a live `hostWindow` AND a
   * human looking at the screen. An agent calling either gets a promise that
   * never usefully resolves — there is nobody to pick a folder.
   *
   * They were catalogued anyway, each carrying an honest description saying it
   * "cannot succeed headlessly". That is the wrong resolution, and it is this
   * repo's own version of a defect the reference implementation shipped:
   * `od export --format pdf` is in Open Design's catalog and cannot run
   * headlessly either, because rasterization lives in its Electron window.
   * **The rule is not "warn about it" — it is "do not catalogue it."** A verb
   * list is a promise; a promise with a footnote saying it cannot be kept is
   * still a broken promise, and it is exactly the "control that quietly
   * disappears" this repo refuses everywhere else.
   *
   * Nothing is lost. The CAPABILITY an agent actually wants is *set the output
   * folder to this path*, and that already exists as `domain.save-project`
   * with an `outputDir`. The picker is a UI affordance for OBTAINING a path,
   * not a capability. The human path is untouched — both remain reachable from
   * the renderer over IPC, which is the only place they ever worked.
   */
  'imagedrip:project:choose-output-dir',
  'imagedrip:repo:choose-root',
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
  // A7 — forgetting a record. Nothing leaves the disk, but a deleted project
  // takes its whole prompt queue with it and there is no undo inside the app.
  'brand.delete',
  'template.delete',
  'project.delete',
  // Attaching a repo WRITES into it — see `repo.attach`'s description and the
  // known gap at the bottom of `docs/working-rules.md`. It is the only verb here
  // that can put files into a repository the user did not expect to be touched.
  'repo.attach',
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
 * Gated verbs the IN-APP PANE may not reach even WITH a human confirm (D1).
 *
 * Every other gated verb becomes reachable-behind-a-confirm once the gate
 * exists, because a human clicking Allow is a human who understands what they
 * allowed. `repo.attach` is the exception, and it is an exception about
 * COMPREHENSION rather than about danger:
 *
 * Its defect is that attaching publishes every unsourced project and template
 * into the repo you point at, stamped with whichever brand is ACTIVE — so
 * attaching an AITLDR repo while a Beauty & Joy project is unsourced writes
 * that project into the AITLDR repo and keeps mirroring every later edit there.
 * A confirm reading "the chat wants to attach a repo — Allow?" does not convey
 * that blast radius, so the human's Yes would not be informed consent. A gate
 * only works when the person can see what they are agreeing to.
 *
 * `CLAUDE.md`: *"repo.attach is knowingly defective and gated. Do not un-gate
 * it."* When the agreed fix lands (import-only + explicit per-record publish),
 * delete this list.
 */
export const PANE_DENIED_VERBS: readonly string[] = ['repo.attach'];

export function isPaneDenied(verb: string): boolean {
  return PANE_DENIED_VERBS.includes(verb);
}

/**
 * `template.create` → `mcp__imagedrip__template_create`.
 *
 * The name a spawned CLI sees for a published verb, which is what
 * `--allowed-tools` / `--disallowed-tools` are matched against. It lives here,
 * with the rest of the policy, because WP4 needs it in main to bound the pane's
 * tool surface — and it must agree EXACTLY with `toolName()` in
 * `scripts/imagedrip-mcp.mjs`, or the pane would allow-list names that no tool
 * answers to and the agent would silently have neither.
 *
 * The proxy keeps its own copy rather than importing this one: it is launched
 * by `.mcp.json` on whatever Node the user has, and must stay plain ESM with no
 * build step. `test/mcp-proxy.test.ts` asserts the two agree on every verb, so
 * the duplication is a CHECKED invariant rather than a drift risk.
 */
export const MCP_TOOL_PREFIX = 'mcp__imagedrip__';

export function toMcpToolName(verb: string): string {
  return `${MCP_TOOL_PREFIX}${verb.replace(/\./g, '_')}`;
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
    'Also the headless way to set a destination — pass outputDir with a path you already know, rather than reaching for a folder picker (there is none on this surface; it needs a human at the screen). Edit the ACTIVE project: name, body (the SUBJECT layer of the primer), or outputDir. Refused with 409 while a run is live if you try to move outputDir. Ask the user before changing outputDir — it decides where images land.',
  'domain.save-brand':
    'Edit the ACTIVE brand body (the LOOK layer). Locked while a run is live and answers 409 — do not retry, tell the user the run must stop first. A brand sourced from a repo DESIGN.md is canonical elsewhere; prefer proposing the change over writing it.',
  'domain.compose-primer':
    'Read-only preview of the exact text that would be posted to ChatGPT: compose(Brand, Template, Project). Use it to show the user what a run would say before asking to start one. Writes nothing.',
  'domain.reset-run':
    'DESTRUCTIVE and confirm-first: re-queues every prompt so the theme can run again. Ask first, every time.',
  'brand.create': 'Create and activate a new brand. Refused with 409 while a run is live.',
  'brand.switch':
    'Activate a saved brand by id (from domain.get -> brands), or null for NO brand. null is a real choice, not an absence: the primer then composes Template + Project only, which is what you want when the work has no house style — do not leave a project on the seeded demo brand just because something has to be selected. Refused with 409 while a run is live.',
  'brand.delete':
    'DESTRUCTIVE and confirm-first: forgets a brand. Ask first, every time. It removes NOTHING from disk — with a repo attached the brand text lives in brand/DESIGN.md and re-attaching imports it back. If the deleted brand was active the selection becomes none, so the next primer carries no house style: say so when you confirm.',
  'template.create':
    'Create a template — the ARTIFACT KIND (character sheet, storyboard, catalogue tile), reusable across brands and projects. Give importFormat so imports cut correctly. Then use template.save to write its body, listPrompt and negatives, and template.switch to point the active project at it. Refused with 409 while a run is live.\n\nMIGRATING AN OLD PROJECT — reach for this when a project body is doing two jobs at once, i.e. it describes both a REUSABLE RECIPE ("a 5-view turnaround, 6 expressions") and a SUBJECT ("Filipino national heroes"). That is the pre-v3 shape and it is why such a project cannot be pointed at a new subject without copy-paste. There is no migrate verb and none is needed; the sequence is: domain.compose-primer to see the current text verbatim, template.create for the recipe, template.save to write the recipe part into its body (and any hard rules into negatives), template.switch to point the project at it, then domain.save-project with the SUBJECT part only. Verify with domain.compose-primer: the primer should read the same as before, just assembled from three layers instead of one. Propose the split to the user before writing — you are rewriting text they authored.',
  'template.switch':
    'Point the ACTIVE project at a template by id, or null for none. Refused with 409 while a run is live.',
  'template.delete':
    'DESTRUCTIVE and confirm-first: forgets a template. Ask first, every time. Refused with 422 while any project still points at it, naming them — switch those to null with template.switch first. Removes nothing from disk; with a repo attached the recipe lives in templates/<id>/ and re-attaching imports it back.',
  'template.save':
    'Write the active template: body (the recipe), promptShape, negatives (hard constraints — prefer putting rules here rather than repeating them in every prompt), listPrompt, importFormat, name. Refused with 409 while a run is live.\n\npromptShape is the RECIPE WRAPPED AROUND EVERY PROMPT, and it is the field to reach for when the user describes what a prompt should LOOK like rather than what it should be about — "each one is a full comic page, six panels, hand-lettered captions, and then the scene changes". body shapes the primer, posted once per conversation; promptShape shapes each individual prompt, so the recipe survives a conversation boundary. Put {prompt} where the queue line goes and {subject} where its short label goes. Empty or absent means every prompt is posted byte-identically to how it was queued, so adding a shape to a live project changes nothing until you write one. A shape that omits {prompt} does not swallow the prompt — it appends it — but write the token: relying on the fallback produces prompts nobody intended.',
  'repo.attach':
    'CONFIRM-FIRST, and currently CARRIES A KNOWN DEFECT — do not call it on your own initiative, and warn the user before they ask for it. Attaching is two directions, not one: it imports what is in the repo AND publishes everything in domain.json that has no sourcePath yet, stamped with whichever brand is ACTIVE. Projects carry no brandId, so a blanket publish has nothing to route with: attaching an AITLDR repo while a Beauty & Joy project is unsourced writes that project into the AITLDR repo and keeps mirroring every later edit there. The agreed fix (import-only + an explicit per-record publish) is not built. Until it is, treat this as unsafe against any repo the user cares about, and say so. See docs/working-rules.md.',
  'project.create':
    'Create and activate a project — the SUBJECT layer. outputDir is optional and defaults to ~/Pictures/ImageDrip/<slug>; pass it when the user names a destination.',
  'project.switch':
    'Activate a saved project by id. Refused with 409 while a run is live, because it repoints where images are written.',
  'project.delete':
    'DESTRUCTIVE and confirm-first: forgets a project AND its prompt queue. Ask first, every time, and say how many prompts go with it (read domain.get first). Refused with 422 for the last remaining project — something must always be active. Deleting the active one activates another. It removes NOTHING from disk: harvested images, run folders and manifests all stay where they are, and with a repo attached projects/<id>/ is still in git.',
  'theme.rename':
    "Rename the ACTIVE project's theme. Not cosmetic: the theme name is slugged into every FUTURE run folder (2026-08-03-1446-<theme>) and is what runs.list shows. It defaults to the project id, so a long-lived project names every batch after itself — rename it to what is actually being generated before starting a run, not after. Past runs keep the name they ran under, which is correct. Refused with 409 while a run is live.",
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

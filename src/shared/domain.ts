/**
 * ImageDrip domain model — the layered composition from `docs/imagedrip-plan.md §3`,
 * split into FOUR axes by `docs/requirements-v3-templates-and-repos.md §2`.
 *
 *   Brand.md      static, 🔒 fixed once     the LOOK      NEVER edited mid-run
 *      └ Template.md  reusable, 🔒 locked    the ARTIFACT  a recipe for a kind of thing
 *           └ Project.md  small, ✎ editable  the SUBJECT   dialled-in + copied BACK
 *                └ Prompt   short, standalone              one line or one --- block
 *
 *   primer = compose(Brand, Template, Project)   ← posted ONCE per conversation
 *   then    a short Prompt per image              ← style inherited from the primed chat
 *
 * Template exists because the Project field was doing two unrelated jobs: "a reusable
 * scene-prompt generator" is a RECIPE, not a body of work, and sitting in the subject
 * field is why it could not be pointed at a new subject without copy-paste.
 *
 * Pure + provider-agnostic (no ChatGPT/webview coupling) — the same model sits behind
 * any future driver (DZINE / Higgsfield). Shared by main (Store) and renderer (UI).
 */

export type PromptStatus = 'queued' | 'harvested';

/** One image request. Short + standalone; style inherited from the primed chat. */
export interface Prompt {
  /** Deterministic id (slug + import index) — stable across a reload. */
  id: string;
  /** Short label, e.g. "avocado" — drives the default output filename. */
  subject: string;
  /** The prompt body fed to the provider. */
  text: string;
  status: PromptStatus;
  /** Set once harvested — absolute path FileAuthor wrote to (run wiring, step 3). */
  savedPath?: string;
  /** Deferred (model allows it): a per-prompt reference image path. */
  refImage?: string;
}

/** Brand.md — the fixed tone. Locked while a run is live, editable between runs. */
export interface Brand {
  /** Stable slug id — unique across the store, survives renames. */
  id: string;
  name: string;
  /** Brand.md content. */
  body: string;
  /**
   * WP2 — the file this body is read from / written back to. When a brand is
   * sourced from a repo's `brand/DESIGN.md` the app treats it as READ-ONLY: the
   * canonical style library is the `brand` skill, and a second editable copy is
   * exactly the drift v-aitldr's "do NOT edit here" rule exists to prevent.
   */
  sourcePath?: string;
  /** WP2 — this brand's repo root (`~/dev/image-projects/i-<brand>`). */
  repoRoot?: string;
}

/** A row in the brand switcher. */
export interface BrandSummary {
  id: string;
  name: string;
}

/**
 * Template.md — the ARTIFACT KIND (character sheet / storyboard / infographic).
 * Reused across every brand and project, which is precisely what the old Project
 * field could not do.
 *
 * It carries more than primer text because it shapes the whole intake: an
 * infographic recipe is inherently multi-line, a character list is one-per-line,
 * and `negatives` is a first-class field rather than something you remember to
 * type — Challenge DV's "no AI-fabricated survivors, faces, or testimonials" has
 * to be structural, not habitual.
 */
export interface Template {
  /** Stable slug id — unique across the store, survives renames. */
  id: string;
  name: string;
  /** template.md content — the primer fragment: the recipe. */
  body: string;
  /** Default import format for projects on this template (the artifact kind decides). */
  importFormat: ImportFormat;
  /** The "ask ChatGPT for N items" helper, tuned per artifact. `{count}`/`{subject}` tokens. */
  listPrompt?: string;
  /** Hard constraints, composed into the primer after the recipe. */
  negatives?: string;
  /** WP2 — the `templates/<id>/` folder this template is read from / written to. */
  sourcePath?: string;
}

/** A row in the template switcher. */
export interface TemplateSummary {
  id: string;
  name: string;
}

/** Project.md — the dialled-in layer; edited then copied BACK to its source. */
export interface Project {
  /** Stable slug id — unique across the store, survives renames. */
  id: string;
  name: string;
  /** Project.md content — the SUBJECT only. */
  body: string;
  /**
   * Which Template this project is built on (§3 `project.json { brand, template }`).
   * Undefined means "no template" — the primer is Brand + Project exactly as it
   * was before v3, which is what keeps every pre-existing project byte-identical.
   */
  templateId?: string;
  /**
   * Which Brand this project belongs to — the axis that did NOT move when you
   * switched projects (v5.1 Item 3). With it, selecting one project moves the
   * whole configuration: brand, recipe, subject, prompt list and output folder.
   *
   * THREE states, and the difference is load-bearing:
   *   `undefined`  never bound — this project has never been told whose it is.
   *                Falls back to the document's `activeBrandId` so nothing about
   *                an existing project changes the day this field appears.
   *   `null`       explicitly "(none)" — compose Template + Project only. The
   *                same first-class "no brand" A1 made expressible.
   *   `string`     bound.
   *
   * It is never INFERRED for records that predate it. v5 §2.1 proposed stamping
   * every project with whichever brand happened to be active at upgrade time;
   * checked against the real store that would have labelled `smoothies` —
   * whose body is verbatim Beauty & Joy — as `appydave`, and made the guess
   * indistinguishable from a choice. `undefined` says "nobody has said", which
   * is the truth, and is the same refusal-to-substitute `activeBrand()` and
   * `activeTemplate()` already make.
   *
   * Also the root cause of the `repo.attach` defect (v5 §1.1): attach stamps
   * unsourced records with the ACTIVE brand because a project carries nothing to
   * route with. This is the field it should route with.
   */
  brandId?: string | null;
  /** WP2 — the `projects/<id>/` folder this project is read from / written back to. */
  sourcePath?: string;
  /** Harvest route target — FileAuthor's scoped root for this project (§8). */
  outputDir?: string;
}

/** A row in the project switcher — enough to pick, not the whole record. */
export interface ProjectSummary {
  id: string;
  name: string;
  outputDir?: string;
}

/** A named batch of prompts run against one primed look. */
export interface Theme {
  name: string;
  prompts: Prompt[];
}

/**
 * A single automated pass over a theme (feed → detect → harvest → re-prime).
 * Declared for the model's shape; NOT driven yet — run wiring is step 3.
 */
export interface Run {
  themeName: string;
  startedAt: number;
  /** Images per conversation before a re-prime (§3 chunking; ~15–20). */
  chunkSize: number;
  harvested: number;
}

/**
 * The renderer-facing domain view: the ACTIVE project + its theme, plus the
 * switcher list. The persisted document holds every project (see
 * `main/domain-migrate.ts`); this view keeps the UI's shape stable.
 */
export interface DomainState {
  /**
   * The active brand, or null when none is selected. Null is a first-class
   * state for exactly the reason it is for Template: the app ships with a demo
   * brand ("Beauty & Joy") that most real projects have nothing to do with, and
   * before this there was no way to say so — every primer carried SOMEBODY's
   * look whether or not it was wanted. `(none)` composes Template + Project.
   */
  brand: Brand | null;
  /**
   * The template the ACTIVE project points at, or null when it points at none.
   * Null is a first-class state, not a missing value: a project with no template
   * composes exactly the pre-v3 primer.
   */
  template: Template | null;
  project: Project;
  theme: Theme;
  activeBrandId: string | null;
  brands: BrandSummary[];
  /** Which template the active project points at (mirrors `project.templateId`). */
  activeTemplateId: string | null;
  templates: TemplateSummary[];
  activeProjectId: string;
  projects: ProjectSummary[];
}

/** kebab-case slug for ids + default filenames; never empty. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'prompt'
  );
}

/** Heading the `negatives` block is composed under — named so it reads as a rule. */
export const NEGATIVES_HEADING = 'Hard constraints — never do any of these:';

/**
 * The Template's contribution to the primer: the recipe, then its hard
 * constraints. Empty for a null template AND for a template with nothing in it,
 * which is what makes the back-compat guarantee below hold.
 */
export function templateFragment(template: Template | null | undefined): string {
  if (!template) return '';
  const negatives = template.negatives?.trim();
  return [template.body.trim(), negatives ? `${NEGATIVES_HEADING}\n${negatives}` : '']
    .filter(Boolean)
    .join('\n\n');
}

/**
 * compose — the primer posted ONCE per conversation (§3), now a THREE-part
 * composition in the order style → recipe → subject:
 *
 *   Brand.md      the look       "warm daylight, soft wooden surfaces"
 *   Template.md   the artifact   "a 5-view turnaround, 6 expressions"
 *   Project.md    the subject    "Filipino national heroes, 1890s dress"
 *
 * BACK-COMPAT GUARANTEE (v3 WP1): a null or empty Template contributes an empty
 * fragment, which `filter(Boolean)` drops — so the output is byte-identical to
 * the two-part primer for every project that existed before templates. That is
 * not a happy accident of the join; it is the reason the fragment is filtered
 * rather than always joined, and `test/domain-compose.test.ts` holds it in place.
 *
 * A null BRAND works by the same mechanism, and is the point of `(none)`: some
 * work has no house style, and until the brand could be dropped the primer
 * always carried one — usually the seeded demo brand, chosen by nobody. The
 * layer drops out cleanly; the other two compose exactly as they would alone.
 *
 * Short prompts inherit this; they are NOT re-baked.
 */
export function compose(
  brand: Brand | null | undefined,
  template: Template | null | undefined,
  project: Project,
): string {
  return [brand?.body.trim() ?? '', templateFragment(template), project.body.trim()]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The canned "ask ChatGPT for an import list" helper. Today's exact wording is
 * the DEFAULT, not the only option — a Template supplies its own tuned version,
 * because the right ask for a storyboard is not the right ask for a nail-art
 * catalogue. `{count}` and `{subject}` are the only tokens.
 */
export const DEFAULT_LIST_PROMPT =
  'Give me a list of {count} {subject}. Names only, one per line, in a code block, no commentary.';

export function renderListPrompt(count: number, subject: string, template?: string): string {
  return (template?.trim() || DEFAULT_LIST_PROMPT)
    .split('{count}')
    .join(String(count))
    .split('{subject}')
    .join(subject);
}

/**
 * parsePromptList — import a simple list into a queue (§ open decision: keep simple).
 * Rules:
 *   - one prompt per line; blank lines and `#` comments are skipped
 *   - optional table form `subject | prompt body` (pipe-delimited) — first field is
 *     the subject/label; the rest is the prompt. Without a pipe, the subject is
 *     derived from the first few words.
 * Deterministic ids (no Date/random) so a re-import of the same list is stable.
 * `startIndex` continues the id suffix after an existing queue (WP3 Add-to-queue).
 */
export function parsePromptList(text: string, startIndex = 0, format: ImportFormat = 'lines'): Prompt[] {
  const out: Prompt[] = [];
  let i = startIndex;
  for (const chunk of splitChunks(text, format)) {
    const first = chunk.split(/\r?\n/, 1)[0];
    i += 1;
    let subject: string;
    let body: string;
    // `subject | body` splits the label off the FIRST line only; in blocks mode
    // the rest of the block still belongs to the body.
    if (first.includes('|')) {
      const cut = first.indexOf('|');
      subject = first.slice(0, cut).trim();
      const restOfFirst = first.slice(cut + 1).trim();
      const remainder = chunk.slice(first.length).replace(/^\r?\n/, '');
      body = [restOfFirst, remainder].filter(Boolean).join('\n') || subject;
    } else {
      body = chunk;
      subject = first.split(/\s+/).slice(0, 3).join(' ');
    }
    out.push({ id: `${slugify(subject)}-${i}`, subject, text: body, status: 'queued' });
  }
  return out;
}

/**
 * Split the draft into one chunk per prompt.
 *
 * `lines`  — one prompt per line. Blank lines and `#` comments are skipped.
 * `blocks` — prompts separated by a line containing only `---`. Everything
 *            between separators is the prompt VERBATIM, including blank lines
 *            and any line starting with `#`. Comment-stripping is deliberately
 *            not applied here: in a multi-line prompt a `#` line is far more
 *            likely to be content than an annotation, and silently deleting a
 *            line from someone's prompt is worse than not supporting comments.
 */
function splitChunks(text: string, format: ImportFormat): string[] {
  if (format === 'blocks') {
    return text
      .split(/^[ \t]*---[ \t]*$/m)
      .map((b) => b.replace(/^(\r?\n)+/, '').replace(/\s+$/, ''))
      .filter(Boolean);
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export type ImportMode = 'replace' | 'add' | 'clear';

/**
 * How a draft is cut into prompts. An EXPLICIT choice at import time, never
 * inferred from content — a one-per-line list that happens to contain a stray
 * `---` would be silently misread as two giant prompts.
 */
export type ImportFormat = 'lines' | 'blocks';

/**
 * mergePrompts (WP3) — the explicit import semantics:
 *   - `add`     append the imported list AFTER the existing queue, in order.
 *   - `replace` drop the QUEUED items only; harvested prompts always survive —
 *               they are the run record (and WP1's manifest makes that matter).
 *   - `clear`   drop the QUEUED items and import nothing. A separate mode
 *               rather than "replace with an empty list", because Replace is
 *               disabled when the draft parses to zero items — which left no
 *               path to an empty queue at all. Same harvested guarantee.
 * Ids stay deterministic: the suffix continues from the kept count, and any
 * residual collision with a kept id bumps the suffix until free.
 */
export function mergePrompts(
  existing: Prompt[],
  text: string,
  mode: ImportMode,
  format: ImportFormat = 'lines',
): Prompt[] {
  const kept = mode === 'add' ? existing : existing.filter((p) => p.status === 'harvested');
  // Clear ignores the draft entirely — it is not an import with no content.
  if (mode === 'clear') return kept;
  const taken = new Set(kept.map((p) => p.id));
  const incoming = parsePromptList(text, kept.length, format).map((p) => {
    let id = p.id;
    const m = /^(.*)-(\d+)$/.exec(id);
    if (m) {
      let n = Number(m[2]);
      while (taken.has(id)) {
        n += 1;
        id = `${m[1]}-${n}`;
      }
    }
    taken.add(id);
    return id === p.id ? p : { ...p, id };
  });
  return [...kept, ...incoming];
}

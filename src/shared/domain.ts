/**
 * ImageDrip domain model — the layered composition from `docs/imagedrip-plan.md §3`.
 *
 *   Brand.md   static, 🔒 fixed once        NEVER edited mid-run
 *      └ Project.md   small, ✎ editable      dialled-in + copied BACK to source
 *           └ Prompt   short, standalone     optionally + a reference image (deferred)
 *
 *   primer = compose(Brand, Project)   ← posted ONCE per conversation
 *   then    a short Prompt per image    ← style inherited from the primed chat
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
}

/** A row in the brand switcher. */
export interface BrandSummary {
  id: string;
  name: string;
}

/** Project.md — the dialled-in layer; edited then copied BACK to its source. */
export interface Project {
  /** Stable slug id — unique across the store, survives renames. */
  id: string;
  name: string;
  /** Project.md content — the only text ImageDrip edits. */
  body: string;
  /** Where to copy Project.md back to (dial-in copy-back; wired later). */
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
  brand: Brand;
  project: Project;
  theme: Theme;
  activeBrandId: string;
  brands: BrandSummary[];
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

/**
 * compose — the primer posted ONCE per conversation (§3). Brand tone first, then
 * the dialled-in Project layer. Short prompts inherit this; they are NOT re-baked.
 */
export function compose(brand: Brand, project: Project): string {
  return [brand.body.trim(), project.body.trim()].filter(Boolean).join('\n\n');
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

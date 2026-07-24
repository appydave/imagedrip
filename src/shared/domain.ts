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

/** Brand.md — the fixed tone. Read-only in practice (§3 sidecar discipline). */
export interface Brand {
  name: string;
  /** Brand.md content. */
  body: string;
}

/** Project.md — the dialled-in layer; edited then copied BACK to its source. */
export interface Project {
  name: string;
  /** Project.md content — the only text ImageDrip edits. */
  body: string;
  /** Where to copy Project.md back to (dial-in copy-back; wired later). */
  sourcePath?: string;
  /** Harvest route target — FileAuthor's scoped root for this project (§8). */
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

/** The whole persisted domain — one JSON document behind the cockpit. */
export interface DomainState {
  brand: Brand;
  project: Project;
  theme: Theme;
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
 */
export function parsePromptList(text: string): Prompt[] {
  const out: Prompt[] = [];
  let i = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    i += 1;
    let subject: string;
    let body: string;
    if (line.includes('|')) {
      const [first, ...rest] = line.split('|');
      subject = first.trim();
      body = rest.join('|').trim() || subject;
    } else {
      body = line;
      subject = line.split(/\s+/).slice(0, 3).join(' ');
    }
    out.push({ id: `${slugify(subject)}-${i}`, subject, text: body, status: 'queued' });
  }
  return out;
}

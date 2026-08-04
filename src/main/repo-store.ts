import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { atomicWrite } from '@appydave/core';
import {
  parsePromptList,
  slugify,
  type ImportFormat,
  type Project,
  type Prompt,
  type Template,
  type Theme,
} from '../shared/domain.js';
import type { ProjectRecord } from './domain-migrate.js';

/**
 * RepoStore (v3 WP2) — the brand repo on disk, which is the SOURCE OF TRUTH.
 *
 * Until now every brand, project, `Project.md` body and queue lived in one
 * unversioned `domain.json` under `~/Library/Application Support/` — outside
 * git, outside Dropbox, outside every repo. Lose it and every configuration is
 * gone. `Project.sourcePath` was declared in v1 for exactly this and never wired.
 *
 * The layout mirrors `video-projects/` because that convention is proven and
 * David already navigates it (§3):
 *
 *   i-<brand>/
 *   ├── brand/DESIGN.md          ← SYNCED from the `brand` skill — NEVER written here
 *   ├── templates/<id>/          ← template.md + template.json
 *   ├── projects/<id>/           ← project.md + prompts.md + project.json + runs/
 *   └── library.json             ← WP4, not yet
 *
 * Pure `node:fs` + `@appydave/core` — no electron — so it is unit-testable
 * against a temp dir the same way `domain-migrate` is.
 */

export const BRAND_DIR = 'brand';
export const BRAND_DESIGN_FILE = 'DESIGN.md';
export const TEMPLATES_DIR = 'templates';
export const PROJECTS_DIR = 'projects';
/** Folders inside `templates/` and `projects/` that are scaffolds, not records. */
const SCAFFOLD = '_template';

export function brandDesignPath(root: string): string {
  return join(root, BRAND_DIR, BRAND_DESIGN_FILE);
}

/**
 * The repo root a `projects/<id>` or `templates/<id>` sourcePath sits inside.
 * Derived from the record's own path rather than from whichever brand happens
 * to be active, so mirroring a save can never write into the wrong repo.
 */
export function repoRootOf(sourcePath: string): string {
  return join(sourcePath, '..', '..');
}

export function templateDir(root: string, id: string): string {
  return join(root, TEMPLATES_DIR, id);
}

export function projectDir(root: string, id: string): string {
  return join(root, PROJECTS_DIR, id);
}

/**
 * The repo-derived output dir for a project: `<repo>/projects/<id>/runs/`.
 * Run folders land INSIDE this as `<runs>/<run-id>/`, so the full path is
 * `<repo>/projects/<project>/runs/<run-id>/` — the WP3 convention.
 */
export function repoRunsDir(root: string, id: string): string {
  return join(projectDir(root, id), 'runs');
}

/* ── serialization ────────────────────────────────────────────────── */

/** On-disk shape of `templates/<id>/template.json`. */
interface TemplateJson {
  id?: string;
  name?: string;
  importFormat?: ImportFormat;
  listPrompt?: string;
  negatives?: string;
}

/** On-disk shape of `projects/<id>/project.json`. */
interface ProjectJson {
  id?: string;
  name?: string;
  /** The brand this project belongs to (§3 `project.json { brand, template }`). */
  brand?: string;
  template?: string;
  themeName?: string;
  /**
   * An outputDir ONLY when it is an explicit override (§6 decision 6). The
   * repo-derived default is left out on purpose: an absolute path committed to
   * git is wrong on every other machine that clones it.
   */
  outputDir?: string;
  /**
   * promptId → savedPath, for prompts already harvested. Keyed by the id that
   * re-reading `prompts.md` regenerates, so the two files agree by construction.
   * Hand-reordering `prompts.md` shifts those ids and un-marks the affected
   * prompts — they re-queue rather than vanish, and the images on disk are
   * untouched either way.
   */
  harvested?: Record<string, string>;
}

/**
 * Serialize a queue to `prompts.md` as `---` blocks. Blocks (not one-per-line)
 * because a multi-line prompt must survive the round trip, and `subject | body`
 * because the subject is what names the output file.
 */
export function serializePrompts(prompts: Prompt[]): string {
  return prompts
    .map((p) => `${p.subject.split('|').join('/').trim()} | ${p.text.trim()}`)
    .join('\n\n---\n\n');
}

/** Parse `prompts.md` back into a queue. Ids are deterministic by position. */
export function parsePromptsFile(text: string): Prompt[] {
  return parsePromptList(text, 0, 'blocks');
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function readJsonOrNull<T>(path: string): Promise<T | null> {
  const raw = await readFileOrNull(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A hand-mangled sidecar must not take the .md content down with it.
    return null;
  }
}

async function write(path: string, content: string): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await atomicWrite(path, content);
}

/** Sub-directories of `dir`, minus the `_template/` scaffold. Empty if absent. */
async function recordDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== SCAFFOLD && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/* ── templates ────────────────────────────────────────────────────── */

/** Write `templates/<id>/{template.md,template.json}`. Returns the sourcePath. */
export async function writeTemplate(root: string, template: Template): Promise<string> {
  const dir = templateDir(root, template.id);
  const json: TemplateJson = {
    id: template.id,
    name: template.name,
    importFormat: template.importFormat,
    ...(template.listPrompt ? { listPrompt: template.listPrompt } : {}),
    ...(template.negatives ? { negatives: template.negatives } : {}),
  };
  await write(join(dir, 'template.md'), template.body);
  await write(join(dir, 'template.json'), `${JSON.stringify(json, null, 2)}\n`);
  return dir;
}

/** Read one `templates/<id>/` folder. Null when there is no `template.md`. */
export async function readTemplate(dir: string): Promise<Template | null> {
  const body = await readFileOrNull(join(dir, 'template.md'));
  if (body === null) return null;
  const json = (await readJsonOrNull<TemplateJson>(join(dir, 'template.json'))) ?? {};
  const id = json.id || slugify(basename(dir));
  return {
    id,
    name: json.name || basename(dir),
    body,
    importFormat: json.importFormat === 'blocks' ? 'blocks' : 'lines',
    ...(json.listPrompt ? { listPrompt: json.listPrompt } : {}),
    ...(json.negatives ? { negatives: json.negatives } : {}),
    sourcePath: dir,
  };
}

/* ── projects ─────────────────────────────────────────────────────── */

/**
 * Write `projects/<id>/{project.md,prompts.md,project.json}`. Returns the
 * sourcePath. `runs/` is created by the harvest path, not here.
 */
export async function writeProject(
  root: string,
  rec: ProjectRecord,
  brandId?: string,
): Promise<string> {
  const dir = projectDir(root, rec.project.id);
  const promptsMd = serializePrompts(rec.theme.prompts);

  // Key the harvest index by the ids re-reading prompts.md will produce, so the
  // two files can never disagree about which prompt a saved image belongs to.
  const reparsed = parsePromptsFile(promptsMd);
  const harvested: Record<string, string> = {};
  rec.theme.prompts.forEach((p, i) => {
    const id = reparsed[i]?.id;
    if (id && p.status === 'harvested' && p.savedPath) harvested[id] = p.savedPath;
  });

  const derivedOut = repoRunsDir(root, rec.project.id);
  const json: ProjectJson = {
    id: rec.project.id,
    name: rec.project.name,
    ...(brandId ? { brand: brandId } : {}),
    ...(rec.project.templateId ? { template: rec.project.templateId } : {}),
    themeName: rec.theme.name,
    ...(rec.project.outputDir && rec.project.outputDir !== derivedOut
      ? { outputDir: rec.project.outputDir }
      : {}),
    ...(Object.keys(harvested).length ? { harvested } : {}),
  };

  await write(join(dir, 'project.md'), rec.project.body);
  await write(join(dir, 'prompts.md'), promptsMd);
  await write(join(dir, 'project.json'), `${JSON.stringify(json, null, 2)}\n`);
  return dir;
}

/** Read one `projects/<id>/` folder. Null when there is no `project.md`. */
export async function readProject(root: string, dir: string): Promise<ProjectRecord | null> {
  const body = await readFileOrNull(join(dir, 'project.md'));
  if (body === null) return null;
  const json = (await readJsonOrNull<ProjectJson>(join(dir, 'project.json'))) ?? {};
  const id = json.id || slugify(basename(dir));
  const promptsMd = (await readFileOrNull(join(dir, 'prompts.md'))) ?? '';
  const harvested = json.harvested ?? {};

  const prompts: Prompt[] = parsePromptsFile(promptsMd).map((p) => {
    const savedPath = harvested[p.id];
    return savedPath ? { ...p, status: 'harvested' as const, savedPath } : p;
  });

  const project: Project = {
    id,
    name: json.name || basename(dir),
    body,
    ...(json.template ? { templateId: json.template } : {}),
    // The derived path is the default; an explicit override in project.json wins.
    outputDir: json.outputDir || repoRunsDir(root, id),
    sourcePath: dir,
  };
  const theme: Theme = { name: json.themeName || id, prompts };
  return { project, theme };
}

/* ── the whole repo ───────────────────────────────────────────────── */

export interface RepoContents {
  /** `brand/DESIGN.md`, when the repo carries one. Never written by the app. */
  brandBody: string | null;
  brandSourcePath: string | null;
  templates: Template[];
  projects: ProjectRecord[];
}

/**
 * Read a whole brand repo. This is the "re-point at the repo and lose nothing"
 * path: with `domain.json` gone, everything below rebuilds from files.
 */
export async function readRepo(root: string): Promise<RepoContents> {
  const brandPath = brandDesignPath(root);
  const brandBody = await readFileOrNull(brandPath);

  const templates: Template[] = [];
  for (const name of await recordDirs(join(root, TEMPLATES_DIR))) {
    const t = await readTemplate(templateDir(root, name));
    if (t) templates.push(t);
  }

  const projects: ProjectRecord[] = [];
  for (const name of await recordDirs(join(root, PROJECTS_DIR))) {
    const p = await readProject(root, projectDir(root, name));
    if (p) projects.push(p);
  }

  return {
    brandBody,
    brandSourcePath: brandBody === null ? null : brandPath,
    templates,
    projects,
  };
}

/* ── scaffolds (WP3) ──────────────────────────────────────────────── */

const TEMPLATE_SCAFFOLD_MD = `# Template — the ARTIFACT KIND

Copy this folder to start a new template. This body is the primer fragment: the
recipe for a *kind* of image, written to be reused across brands and subjects.

Say what the artifact IS, not what it is OF. "A 5-view character turnaround with
6 expressions and a colour palette strip" is a template; "José Rizal, round
glasses" is a prompt, and "Filipino national heroes" is a project.
`;

const TEMPLATE_SCAFFOLD_JSON = `{
  "name": "_template",
  "importFormat": "lines",
  "listPrompt": "Give me a list of {count} {subject}. Names only, one per line, in a code block, no commentary.",
  "negatives": ""
}
`;

const PROJECT_SCAFFOLD_MD = `# Project — the SUBJECT

Copy this folder to start a new project. This body names *this particular body
of work* and nothing else — the look lives in the brand, the recipe lives in the
template.
`;

const PROJECT_SCAFFOLD_PROMPTS = `subject | the prompt body, which may run to as many lines as it likes

---

another subject | the next prompt
`;

const PROJECT_SCAFFOLD_JSON = `{
  "name": "_template",
  "themeName": "_template"
}
`;

/** Write a file only when it is absent — a scaffold never overwrites real work. */
async function writeIfAbsent(path: string, content: string): Promise<boolean> {
  if ((await readFileOrNull(path)) !== null) return false;
  await write(path, content);
  return true;
}

/**
 * Create the `_template/` scaffolds for templates and projects (WP3), plus the
 * folders they live in. Idempotent and strictly additive — it never touches an
 * existing file, and it NEVER runs `git init`: whether a brand repo is a git
 * repo is WP5's decision, not a side effect of opening a folder.
 */
export async function ensureScaffolds(root: string): Promise<void> {
  const t = templateDir(root, SCAFFOLD);
  const p = projectDir(root, SCAFFOLD);
  await writeIfAbsent(join(t, 'template.md'), TEMPLATE_SCAFFOLD_MD);
  await writeIfAbsent(join(t, 'template.json'), TEMPLATE_SCAFFOLD_JSON);
  await writeIfAbsent(join(p, 'project.md'), PROJECT_SCAFFOLD_MD);
  await writeIfAbsent(join(p, 'prompts.md'), PROJECT_SCAFFOLD_PROMPTS);
  await writeIfAbsent(join(p, 'project.json'), PROJECT_SCAFFOLD_JSON);
}

import { join } from 'node:path';
import {
  parsePromptList,
  slugify,
  type Brand,
  type Project,
  type Theme,
} from '../shared/domain.js';

/**
 * The persisted domain document + its migration chain.
 *
 *   v1 — one { brand, project, theme }
 *   v2 — multi-project: { brand, projects[], activeProjectId }        (WP1)
 *   v3 — multi-brand:   { brands[], activeBrandId, projects[], … }    (WP2)
 *
 * Migration is silent and lossless: existing content becomes the first
 * record(s), untouched. Pure (no electron imports) so it is unit-testable —
 * the only environment input is `outputRoot` (in the app: ~/Pictures/ImageDrip).
 */

/** One project + the theme it owns. */
export interface ProjectRecord {
  project: Project;
  theme: Theme;
}

export interface PersistedDomain {
  version: 3;
  brands: Brand[];
  activeBrandId: string;
  projects: ProjectRecord[];
  activeProjectId: string;
}

/** Default, VISIBLE output dir for a project — the anti-`userData/harvest`. */
export function defaultProjectDir(outputRoot: string, name: string): string {
  return join(outputRoot, slugify(name));
}

/** Unique slug id for a new brand/project (suffixes -2, -3… on collision). */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const base = slugify(name);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Seeded to the chosen design's example (Beauty & Joy · Smoothies) so the shell
// shows a real, honest layout on first run (carried over from v1 verbatim).
const SEED_QUEUE = [
  'avocado',
  'banana',
  'mango',
  'lime',
  'blueberry',
  'coconut',
  'pineapple',
  'dragonfruit',
].join('\n');

const SEED_BRAND: Brand = {
  id: 'beauty-joy',
  name: 'Beauty & Joy',
  body: 'Brand: Beauty & Joy — bright, natural, wholesome. Warm daylight, soft wooden surfaces, fresh and clean.',
};

const SEED_PROJECT_BODY = [
  'Project: Smoothies. For EACH message I send (a single fruit or ingredient name),',
  'generate ONE photorealistic product image of that fruit as a fresh smoothie or whole fruit,',
  'in the Beauty & Joy style — warm natural light, soft wooden background, no text and no words.',
  'Reply with only the image.',
].join(' ');

/** First-run defaults (fresh install — no domain.json yet). */
export function seedDefaults(outputRoot: string): PersistedDomain {
  return {
    version: 3,
    brands: [SEED_BRAND],
    activeBrandId: SEED_BRAND.id,
    projects: [
      {
        project: {
          id: 'smoothies',
          name: 'Smoothies',
          body: SEED_PROJECT_BODY,
          outputDir: defaultProjectDir(outputRoot, 'Smoothies'),
        },
        theme: { name: 'smoothies', prompts: parsePromptList(SEED_QUEUE) },
      },
    ],
    activeProjectId: 'smoothies',
  };
}

type LooseBrand = Omit<Brand, 'id'> & { id?: string };

interface V1Shape {
  brand: LooseBrand;
  project: Omit<Project, 'id'> & { id?: string };
  theme: Theme;
}

interface V2Shape {
  version: 2;
  brand: LooseBrand;
  projects: ProjectRecord[];
  activeProjectId: string;
}

function isV3(raw: unknown): raw is PersistedDomain {
  const r = raw as Partial<PersistedDomain> | null;
  return !!r && r.version === 3 && Array.isArray(r.brands) && Array.isArray(r.projects);
}

function isV2(raw: unknown): raw is V2Shape {
  const r = raw as Partial<V2Shape> | null;
  return !!r && r.version === 2 && Array.isArray(r.projects) && typeof r.activeProjectId === 'string';
}

function isV1(raw: unknown): raw is V1Shape {
  const r = raw as Partial<V1Shape> | null;
  return !!r && !!r.brand && !!r.project && !!r.theme && !('version' in (r as object));
}

/** Backfill any project record missing id/outputDir (defensive, idempotent). */
function fixProjects(
  projects: ProjectRecord[],
  outputRoot: string,
): { projects: ProjectRecord[]; touched: boolean } {
  let touched = false;
  const fixed = projects.map((rec) => {
    const id =
      rec.project.id ||
      uniqueSlug(rec.project.name, projects.map((p) => p.project.id).filter(Boolean));
    const outputDir = rec.project.outputDir || defaultProjectDir(outputRoot, rec.project.name);
    if (id !== rec.project.id || outputDir !== rec.project.outputDir) touched = true;
    return { ...rec, project: { ...rec.project, id, outputDir } };
  });
  return { projects: fixed, touched };
}

/** v2 → v3: the single brand becomes the first (active) brand record. */
function v2ToV3(raw: V2Shape): PersistedDomain {
  const brand: Brand = { ...raw.brand, id: raw.brand.id || slugify(raw.brand.name) };
  return {
    version: 3,
    brands: [brand],
    activeBrandId: brand.id,
    projects: raw.projects,
    activeProjectId: raw.activeProjectId,
  };
}

/** v1 → v2: the single project becomes the first (active) project record. */
function v1ToV2(raw: V1Shape, outputRoot: string): V2Shape {
  const id = raw.project.id || slugify(raw.project.name);
  return {
    version: 2,
    brand: raw.brand,
    projects: [
      {
        project: {
          ...raw.project,
          id,
          outputDir: raw.project.outputDir || defaultProjectDir(outputRoot, raw.project.name),
        },
        theme: raw.theme,
      },
    ],
    activeProjectId: id,
  };
}

/**
 * Normalize whatever is on disk to v3. `migrated` signals the caller to write
 * the upgraded document back. Unrecognizable input falls back to seed defaults
 * (should not happen — createStore supplies defaults for a missing file).
 */
export function migrateDomain(
  raw: unknown,
  outputRoot: string,
): { state: PersistedDomain; migrated: boolean } {
  if (isV3(raw)) {
    const { projects, touched } = fixProjects(raw.projects, outputRoot);
    let brandsTouched = false;
    const brands = raw.brands.map((b) => {
      const id = b.id || uniqueSlug(b.name, raw.brands.map((x) => x.id).filter(Boolean));
      if (id !== b.id) brandsTouched = true;
      return { ...b, id };
    });
    return {
      state: { ...raw, projects, brands },
      migrated: touched || brandsTouched,
    };
  }

  if (isV2(raw)) {
    const { projects } = fixProjects(raw.projects, outputRoot);
    return { state: v2ToV3({ ...raw, projects }), migrated: true };
  }

  if (isV1(raw)) {
    return { state: v2ToV3(v1ToV2(raw, outputRoot)), migrated: true };
  }

  return { state: seedDefaults(outputRoot), migrated: true };
}

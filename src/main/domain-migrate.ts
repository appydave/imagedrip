import { join } from 'node:path';
import {
  parsePromptList,
  slugify,
  type Brand,
  type Project,
  type Theme,
} from '../shared/domain.js';

/**
 * The persisted multi-project document (WP1) + the v1 → v2 migration.
 *
 * v1 persisted exactly one { brand, project, theme }. v2 holds every project
 * (each owning its theme) plus which one is active. Migration is silent and
 * lossless: the existing project/queue becomes the first record, untouched.
 *
 * Pure (no electron imports) so the migration is unit-testable — the only
 * environment input is `outputRoot` (in the app: ~/Pictures/ImageDrip).
 */

/** One project + the theme it owns. */
export interface ProjectRecord {
  project: Project;
  theme: Theme;
}

export interface PersistedDomain {
  version: 2;
  brand: Brand;
  projects: ProjectRecord[];
  activeProjectId: string;
}

/** Default, VISIBLE output dir for a project — the anti-`userData/harvest`. */
export function defaultProjectDir(outputRoot: string, name: string): string {
  return join(outputRoot, slugify(name));
}

/** Unique slug id for a new project (suffixes -2, -3… on collision). */
export function uniqueProjectId(name: string, taken: Iterable<string>): string {
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
    version: 2,
    brand: SEED_BRAND,
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

interface V1Shape {
  brand: Brand;
  project: Omit<Project, 'id'> & { id?: string };
  theme: Theme;
}

function isV2(raw: unknown): raw is PersistedDomain {
  const r = raw as Partial<PersistedDomain> | null;
  return !!r && r.version === 2 && Array.isArray(r.projects) && typeof r.activeProjectId === 'string';
}

function isV1(raw: unknown): raw is V1Shape {
  const r = raw as Partial<V1Shape> | null;
  return !!r && !!r.brand && !!r.project && !!r.theme && !('version' in (r as object));
}

/**
 * Normalize whatever is on disk to v2. `migrated` signals the caller to write
 * the upgraded document back. Unrecognizable input falls back to seed defaults
 * (should not happen — createStore supplies defaults for a missing file).
 */
export function migrateDomain(
  raw: unknown,
  outputRoot: string,
): { state: PersistedDomain; migrated: boolean } {
  if (isV2(raw)) {
    // Backfill id/outputDir on any record missing them (defensive, idempotent).
    let touched = false;
    const projects = raw.projects.map((rec) => {
      const id = rec.project.id || uniqueProjectId(rec.project.name, raw.projects.map((p) => p.project.id).filter(Boolean));
      const outputDir = rec.project.outputDir || defaultProjectDir(outputRoot, rec.project.name);
      if (id !== rec.project.id || outputDir !== rec.project.outputDir) touched = true;
      return { ...rec, project: { ...rec.project, id, outputDir } };
    });
    return { state: { ...raw, projects }, migrated: touched };
  }

  if (isV1(raw)) {
    const id = raw.project.id || slugify(raw.project.name);
    return {
      migrated: true,
      state: {
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
      },
    };
  }

  return { state: seedDefaults(outputRoot), migrated: true };
}

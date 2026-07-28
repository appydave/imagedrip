import { join } from 'node:path';
import { app } from 'electron';
import { createStore, type Store } from '@appydave/core';
import {
  compose,
  parsePromptList,
  type DomainState,
  type Prompt,
} from '../shared/domain.js';
import {
  defaultProjectDir,
  migrateDomain,
  seedDefaults,
  uniqueSlug,
  type PersistedDomain,
  type ProjectRecord,
} from './domain-migrate.js';

/**
 * DomainStore — the local-first persistence behind the cockpit.
 * Wraps `@appydave/core` Store over one `domain.json` under userData.
 *
 * WP1: the document is multi-project (`domain-migrate.ts` owns the shape and
 * the silent v1 → v2 upgrade). Every accessor below reads/writes the ACTIVE
 * project, so the v1 call sites did not have to change; `createProject` /
 * `switchProject` are the new identity surface. A project only becomes real
 * here — the renderer's "new project" form is a draft until Create.
 */

let store: Store<PersistedDomain> | null = null;

/** The visible per-project output root: ~/Pictures/ImageDrip. */
export function outputRoot(): string {
  return join(app.getPath('pictures'), 'ImageDrip');
}

function domain(): Store<PersistedDomain> {
  store ??= createStore<PersistedDomain>({
    path: join(app.getPath('userData'), 'domain.json'),
    defaults: seedDefaults(outputRoot()),
  });
  return store;
}

/** Read the persisted document, upgrading a v1 file in place on first touch. */
async function persisted(): Promise<PersistedDomain> {
  const raw = (await domain().read()) as unknown;
  const { state, migrated } = migrateDomain(raw, outputRoot());
  if (migrated) await domain().update(() => state);
  return state;
}

function activeRecord(s: PersistedDomain): ProjectRecord {
  return s.projects.find((r) => r.project.id === s.activeProjectId) ?? s.projects[0];
}

function activeBrand(s: PersistedDomain): (typeof s.brands)[number] {
  return s.brands.find((b) => b.id === s.activeBrandId) ?? s.brands[0];
}

/** The renderer-facing view: active brand + project + theme, plus switcher lists. */
function view(s: PersistedDomain): DomainState {
  const rec = activeRecord(s);
  const brand = activeBrand(s);
  return {
    brand,
    project: rec.project,
    theme: rec.theme,
    activeBrandId: brand.id,
    brands: s.brands.map((b) => ({ id: b.id, name: b.name })),
    activeProjectId: rec.project.id,
    projects: s.projects.map((r) => ({
      id: r.project.id,
      name: r.project.name,
      outputDir: r.project.outputDir,
    })),
  };
}

/** Update the ACTIVE project record; returns the new renderer view. */
async function updateActive(fn: (rec: ProjectRecord) => ProjectRecord): Promise<DomainState> {
  const current = await persisted();
  const next = await domain().update(() => ({
    ...current,
    projects: current.projects.map((r) => (r.project.id === current.activeProjectId ? fn(r) : r)),
  }));
  return view(next);
}

/** Read the whole domain document (renderer view). */
export async function getDomain(): Promise<DomainState> {
  return view(await persisted());
}

/** Replace the active theme queue from a pasted/imported prompt list. Harvested
 *  items are dropped — a fresh import defines a fresh run. (WP3 revisits this.) */
export async function importPrompts(text: string): Promise<DomainState> {
  const prompts: Prompt[] = parsePromptList(text);
  return updateActive((rec) => ({ ...rec, theme: { ...rec.theme, prompts } }));
}

/** Persist an edit to the active project (body and/or name — WP2 autosave). */
export async function saveProject(patch: { name?: string; body?: string }): Promise<DomainState> {
  const name = patch.name?.trim();
  return updateActive((rec) => ({
    ...rec,
    project: {
      ...rec.project,
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(name ? { name } : {}),
    },
  }));
}

/** Persist an edit to the ACTIVE brand. Callers must hold the run lock (WP2). */
export async function saveBrand(patch: { name?: string; body?: string }): Promise<DomainState> {
  const name = patch.name?.trim();
  const current = await persisted();
  const active = current.brands.find((b) => b.id === current.activeBrandId) ?? current.brands[0];
  const next = await domain().update(() => ({
    ...current,
    brands: current.brands.map((b) =>
      b.id === active.id
        ? {
            ...b,
            ...(patch.body !== undefined ? { body: patch.body } : {}),
            ...(name ? { name } : {}),
          }
        : b,
    ),
  }));
  return view(next);
}

/** Create + activate a brand. Draft-until-Create, same discipline as projects. */
export async function createBrand(input: { name: string }): Promise<DomainState> {
  const name = input.name.trim();
  if (!name) throw new Error('brand name is required');
  const current = await persisted();
  const id = uniqueSlug(name, current.brands.map((b) => b.id));
  const next = await domain().update(() => ({
    ...current,
    brands: [...current.brands, { id, name, body: '' }],
    activeBrandId: id,
  }));
  return view(next);
}

/** Activate a saved brand by id. Callers must hold the run lock (WP2). */
export async function switchBrand(id: string): Promise<DomainState> {
  const current = await persisted();
  if (!current.brands.some((b) => b.id === id)) throw new Error(`unknown brand: ${id}`);
  const next = await domain().update(() => ({ ...current, activeBrandId: id }));
  return view(next);
}

/** The primer = compose(active Brand, active Project) — posted ONCE per conversation. */
export async function composePrimer(): Promise<string> {
  const s = await persisted();
  return compose(activeBrand(s), activeRecord(s).project);
}

/** The active theme prompts, in order — the run queue snapshot source. */
export async function getQueue(): Promise<Prompt[]> {
  return activeRecord(await persisted()).theme.prompts;
}

/** Re-queue every prompt (clear harvested status) so a theme can be run again. */
export async function resetRun(): Promise<DomainState> {
  return updateActive((rec) => ({
    ...rec,
    theme: {
      ...rec.theme,
      prompts: rec.theme.prompts.map((p) => ({
        ...p,
        status: 'queued' as const,
        savedPath: undefined,
      })),
    },
  }));
}

/** Mark one prompt harvested + record where FileAuthor routed it. */
export async function markHarvested(promptId: string, savedPath: string): Promise<DomainState> {
  return updateActive((rec) => ({
    ...rec,
    theme: {
      ...rec.theme,
      prompts: rec.theme.prompts.map((p) =>
        p.id === promptId ? { ...p, status: 'harvested', savedPath } : p,
      ),
    },
  }));
}

/** The active project's output dir (always set post-migration; fallback derived). */
export async function getActiveOutputDir(): Promise<string> {
  const rec = activeRecord(await persisted());
  return rec.project.outputDir ?? defaultProjectDir(outputRoot(), rec.project.name);
}

/** Create + activate a project. This is the ONLY way a project becomes real. */
export async function createProject(input: {
  name: string;
  outputDir?: string;
}): Promise<DomainState> {
  const name = input.name.trim();
  if (!name) throw new Error('project name is required');
  const current = await persisted();
  const id = uniqueSlug(name, current.projects.map((r) => r.project.id));
  const record: ProjectRecord = {
    project: {
      id,
      name,
      body: '',
      outputDir: input.outputDir?.trim() || defaultProjectDir(outputRoot(), name),
    },
    theme: { name: id, prompts: [] },
  };
  const next = await domain().update(() => ({
    ...current,
    projects: [...current.projects, record],
    activeProjectId: id,
  }));
  return view(next);
}

/** Activate a saved project by id. */
export async function switchProject(id: string): Promise<DomainState> {
  const current = await persisted();
  if (!current.projects.some((r) => r.project.id === id)) {
    throw new Error(`unknown project: ${id}`);
  }
  const next = await domain().update(() => ({ ...current, activeProjectId: id }));
  return view(next);
}

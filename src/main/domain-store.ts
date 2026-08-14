import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { createStore, type Store } from '@appydave/core';
import {
  compose,
  mergePrompts,
  type Brand,
  type DomainState,
  type ImportFormat,
  type ImportMode,
  type Prompt,
  type Template,
} from '../shared/domain.js';
import {
  defaultProjectDir,
  migrateDomain,
  seedDefaults,
  uniqueSlug,
  type PersistedDomain,
  type ProjectRecord,
} from './domain-migrate.js';
import {
  ensureScaffolds,
  projectDir,
  readRepo,
  readProject,
  readTemplate,
  repoRootOf,
  repoRunsDir,
  templateDir,
  writeProject,
  writeTemplate,
} from './repo-store.js';

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

function domainPath(): string {
  return join(app.getPath('userData'), 'domain.json');
}

function domain(): Store<PersistedDomain> {
  store ??= createStore<PersistedDomain>({
    path: domainPath(),
    defaults: seedDefaults(outputRoot()),
  });
  return store;
}

/** Normalize whatever shape is on disk to v3 (idempotent, pure). */
function normalize(raw: unknown): PersistedDomain {
  return migrateDomain(raw, outputRoot()).state;
}

/**
 * Read the persisted document, upgrading an old file in place on first touch.
 * Advisory-1 #3: a timestamped .bak is taken BEFORE any migrating write, so
 * David's real data always has a restore point next to it.
 */
async function persisted(): Promise<PersistedDomain> {
  const raw = (await domain().read()) as unknown;
  const { state, migrated } = migrateDomain(raw, outputRoot());
  if (!migrated) return state;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await fs.copyFile(domainPath(), `${domainPath()}.${stamp}.bak`);
  } catch {
    // no file yet (fresh install) — nothing to back up
  }
  return domain().update((s) => normalize(s));
}

/**
 * Every mutation derives its result from the update() CLOSURE ARGUMENT — never
 * from a pre-read snapshot (advisory-1 #2). Two concurrent autosaves (Brand +
 * Project debounce both firing) must both survive; a stale-snapshot spread
 * would silently discard whichever landed first.
 */
async function updateDoc(fn: (s: PersistedDomain) => PersistedDomain): Promise<DomainState> {
  await persisted(); // migration (with backup) happens before structural edits
  const next = await domain().update((s) => fn(normalize(s)));
  return view(next);
}

function activeRecord(s: PersistedDomain): ProjectRecord {
  return s.projects.find((r) => r.project.id === s.activeProjectId) ?? s.projects[0];
}

/**
 * The ACTIVE brand — null when "(none)" is selected, and null when the selected
 * id no longer exists. Mirrors `activeTemplate` deliberately, including the
 * refusal to substitute: falling back to `brands[0]` meant a stale or deleted id
 * silently put SOMEBODY ELSE'S look into the primer, and a wrong brand is worse
 * than a missing one — a missing one is visible in the card as `(none)`.
 *
 * v5.1 Item 3 — the brand is now a property of the UNIT. It is DERIVED from the
 * active project's `brandId`, falling back to the document-level `activeBrandId`
 * for a project that has never been bound. Derived rather than synced on
 * purpose: two fields kept in step by hand drift, and a brand that drifts is a
 * wrong look in a primer nobody edited. `switchProject` therefore needs no brand
 * logic at all — the brand moves because it was never separately stored.
 */
function activeBrand(s: PersistedDomain): Brand | null {
  const bound = activeRecord(s)?.project.brandId;
  const id = bound === undefined ? s.activeBrandId : bound;
  if (!id) return null;
  return s.brands.find((b) => b.id === id) ?? null;
}

/**
 * The template the ACTIVE project points at — null when it points at none, and
 * null when it points at one that no longer exists. Never a silent substitute:
 * a wrong recipe in the primer is worse than a missing one, and the TEMPLATE
 * card shows "(none)" either way.
 */
function activeTemplate(s: PersistedDomain): Template | null {
  const id = activeRecord(s).project.templateId;
  if (!id) return null;
  return s.templates.find((t) => t.id === id) ?? null;
}

/** The renderer-facing view: active brand + template + project + theme, plus switcher lists. */
function view(s: PersistedDomain): DomainState {
  const rec = activeRecord(s);
  const brand = activeBrand(s);
  const template = activeTemplate(s);
  return {
    brand,
    template,
    project: rec.project,
    theme: rec.theme,
    activeBrandId: brand?.id ?? null,
    brands: s.brands.map((b) => ({ id: b.id, name: b.name })),
    activeTemplateId: template?.id ?? null,
    templates: s.templates.map((t) => ({ id: t.id, name: t.name })),
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
  return updateDoc((s) => {
    const activeId = activeRecord(s).project.id;
    return { ...s, projects: s.projects.map((r) => (r.project.id === activeId ? fn(r) : r)) };
  });
}

/* ── WP2: the repo on disk is the source of truth ─────────────────── */

/**
 * Mirror the ACTIVE project (and the template it points at) back to their repo
 * folders. Only records that HAVE a sourcePath are written — an unsourced
 * install keeps working exactly as it did, with `domain.json` as its only store.
 *
 * The repo root comes from each record's own sourcePath, never from whichever
 * brand is active, so a save can never land in the wrong repo.
 *
 * `quiet` is for the run path (`markHarvested`): a run must never die because a
 * repo write failed. Explicit user saves stay loud — a save that silently did
 * not reach disk is precisely the failure this work package exists to end.
 */
async function mirrorActive(quiet = false): Promise<void> {
  try {
    const s = await persisted();
    const rec = activeRecord(s);
    const template = activeTemplate(s);
    if (rec.project.sourcePath) {
      // `brandId` is optional on writeProject — with "(none)" the project.json
      // simply carries no `brand` key, which is what a brand-less project IS.
      await writeProject(repoRootOf(rec.project.sourcePath), rec, activeBrand(s)?.id);
    }
    if (template?.sourcePath) {
      await writeTemplate(repoRootOf(template.sourcePath), template);
    }
  } catch (err) {
    if (!quiet) throw err;
  }
}

/** Run a mutation, then push the result to disk. Returns the post-write view. */
async function updateAndMirror(
  fn: () => Promise<DomainState>,
  quiet = false,
): Promise<DomainState> {
  const state = await fn();
  await mirrorActive(quiet);
  return state;
}

/**
 * Read the ACTIVE brand/template/project back OFF disk (v3 WP2, "read on
 * activate"). Disk wins: the repo is the source of truth, and an edit made in
 * an editor or pulled from git must be what the app shows.
 *
 * A record whose file has gone is left as it is rather than blanked — a missing
 * file is far more likely to be an un-cloned repo than a deletion, and silently
 * emptying David's Project.md over a mount that had not come up yet would be
 * unrecoverable.
 */
async function hydrateActive(): Promise<void> {
  const s = await persisted();
  const rec = activeRecord(s);
  const brand = activeBrand(s);
  const template = activeTemplate(s);

  const brandBody = brand?.sourcePath ? await readFileQuietly(brand.sourcePath) : null;
  const freshTemplate = template?.sourcePath ? await readTemplate(template.sourcePath) : null;
  const freshProject = rec.project.sourcePath
    ? await readProject(repoRootOf(rec.project.sourcePath), rec.project.sourcePath)
    : null;

  if (brandBody === null && !freshTemplate && !freshProject) return;

  await updateDoc((doc) => ({
    ...doc,
    brands: doc.brands.map((b) =>
      brand && b.id === brand.id && brandBody !== null ? { ...b, body: brandBody } : b,
    ),
    templates: doc.templates.map((t) =>
      freshTemplate && t.id === freshTemplate.id ? { ...t, ...freshTemplate } : t,
    ),
    projects: doc.projects.map((r) =>
      freshProject && r.project.id === freshProject.project.id
        ? // Keep the id the document already uses; everything else comes from disk.
          { project: { ...freshProject.project, id: r.project.id }, theme: freshProject.theme }
        : r,
    ),
  }));
}

async function readFileQuietly(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Attach a brand repo (v3 WP2). Two directions in one action, because both are
 * needed for the store to become a pointer index rather than the store:
 *
 *   1. IMPORT — everything already in the repo is read in. Disk wins on a
 *      matching id; unknown ids are added. This is the "delete domain.json,
 *      re-point at the repo, lose nothing" path.
 *   2. PUBLISH — anything still unsourced is written OUT to the repo, so an
 *      existing install's work moves into git rather than being stranded.
 *
 * `brand/DESIGN.md` is only ever READ. The canonical style library is the
 * `brand` skill, and a second editable copy is exactly the drift v-aitldr's
 * "do NOT edit here" rule exists to prevent.
 *
 * It does NOT git-init the repo — see `ensureScaffolds`.
 */
export async function attachRepo(root: string): Promise<DomainState> {
  // A repo is attached to a BRAND — it is that brand's `repoRoot`. With "(none)"
  // there is nothing to attach it to, so refuse loudly rather than pick one.
  if (!activeBrand(await persisted())) {
    throw new Error('no brand selected — pick or create a brand before attaching its repo');
  }
  const contents = await readRepo(root);
  await ensureScaffolds(root);

  // 1. Import — disk wins on a matching id, unknown ids are added.
  await updateDoc((s) => {
    const activeBrandId = activeBrand(s)?.id;
    const templates = [...s.templates];
    for (const t of contents.templates) {
      const i = templates.findIndex((x) => x.id === t.id);
      if (i >= 0) templates[i] = { ...templates[i], ...t };
      else templates.push(t);
    }
    const projects = [...s.projects];
    for (const rec of contents.projects) {
      const i = projects.findIndex((r) => r.project.id === rec.project.id);
      if (i >= 0) projects[i] = rec;
      else projects.push(rec);
    }
    return {
      ...s,
      brands: s.brands.map((b) =>
        b.id === activeBrandId
          ? {
              ...b,
              repoRoot: root,
              ...(contents.brandSourcePath ? { sourcePath: contents.brandSourcePath } : {}),
              ...(contents.brandBody !== null ? { body: contents.brandBody } : {}),
            }
          : b,
      ),
      templates,
      projects,
    };
  });

  // 2. Publish — write out whatever is still only in domain.json, then record
  //    the sourcePaths those writes established.
  const s = await persisted();
  const brandId = activeBrand(s)?.id;
  const published = new Map<string, string>();
  for (const t of s.templates) {
    if (!t.sourcePath) published.set(`t:${t.id}`, await writeTemplate(root, t));
  }
  for (const rec of s.projects) {
    if (!rec.project.sourcePath) published.set(`p:${rec.project.id}`, await writeProject(root, rec, brandId));
  }
  if (published.size === 0) return getDomain();

  return updateDoc((doc) => ({
    ...doc,
    templates: doc.templates.map((t) => {
      const path = published.get(`t:${t.id}`);
      return path ? { ...t, sourcePath: path } : t;
    }),
    projects: doc.projects.map((r) => {
      const path = published.get(`p:${r.project.id}`);
      return path ? { ...r, project: { ...r.project, sourcePath: path } } : r;
    }),
  }));
}

/**
 * Hydrate once per process on the first read — opening the app IS activating
 * whatever was already active, so an edit made in an editor between sessions
 * has to be what you see.
 */
let hydrated = false;

/** Read the whole domain document (renderer view). */
export async function getDomain(): Promise<DomainState> {
  if (!hydrated) {
    hydrated = true;
    await hydrateActive();
  }
  return view(await persisted());
}

/** Import a prompt list into the active theme (WP3): `add` appends after the
 *  existing queue; `replace` drops queued items but ALWAYS keeps harvested. */
export async function importPrompts(
  text: string,
  mode: ImportMode,
  format: ImportFormat = 'lines',
): Promise<DomainState> {
  return updateAndMirror(() =>
    updateActive((rec) => ({
      ...rec,
      theme: { ...rec.theme, prompts: mergePrompts(rec.theme.prompts, text, mode, format) },
    })),
  );
}

/**
 * Persist an edit to the active project (name, body and/or outputDir).
 *
 * outputDir joined the patch so the folder is changeable AFTER creation — it
 * used to be settable only in the new-project form, which made a wrong choice
 * permanent for the life of the project.
 */
export async function saveProject(patch: {
  name?: string;
  body?: string;
  outputDir?: string;
}): Promise<DomainState> {
  const name = patch.name?.trim();
  const outputDir = patch.outputDir?.trim();
  return updateAndMirror(() =>
    updateActive((rec) => ({
      ...rec,
      project: {
        ...rec.project,
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(name ? { name } : {}),
        ...(outputDir ? { outputDir } : {}),
      },
    })),
  );
}

/**
 * Persist an edit to the ACTIVE brand. Callers must hold the run lock (v2 WP2).
 *
 * A brand SOURCED from a repo's `brand/DESIGN.md` is read-only (v3 WP2): the
 * canonical style library is the `brand` skill, and the app holding a second
 * editable copy is exactly the drift `v-aitldr`'s "do NOT edit here" rule
 * exists to prevent. It refuses loudly rather than accepting an edit that the
 * next sync would silently throw away.
 */
export async function saveBrand(patch: { name?: string; body?: string }): Promise<DomainState> {
  const name = patch.name?.trim();
  const current = activeBrand(await persisted());
  // With "(none)" there is no record to edit. Refusing is the honest answer:
  // silently doing nothing would look like a save that landed.
  if (!current) throw new Error('no brand selected — pick or create one first');
  if (patch.body !== undefined && current.sourcePath) {
    throw new Error(
      `brand body is synced from ${current.sourcePath} — edit it at the source, not here`,
    );
  }
  return updateDoc((s) => {
    const activeId = activeBrand(s)?.id;
    return {
      ...s,
      brands: s.brands.map((b) =>
        b.id === activeId
          ? {
              ...b,
              ...(patch.body !== undefined ? { body: patch.body } : {}),
              ...(name ? { name } : {}),
            }
          : b,
      ),
    };
  });
}

/** Create + activate a brand. Draft-until-Create, same discipline as projects. */
export async function createBrand(input: { name: string }): Promise<DomainState> {
  const name = input.name.trim();
  if (!name) throw new Error('brand name is required');
  return updateDoc((s) => {
    const id = uniqueSlug(name, s.brands.map((b) => b.id));
    const activeId = activeRecord(s)?.project.id;
    return {
      ...s,
      brands: [...s.brands, { id, name, body: '' }],
      activeBrandId: id,
      // Binds for the same reason `switchBrand` does — and here it is not
      // merely consistency: the brand is DERIVED from the active project, so
      // creating one without binding would activate a brand the card never
      // showed. A control that appears to do nothing is the silent failure.
      projects: s.projects.map((r) =>
        r.project.id === activeId ? { ...r, project: { ...r.project, brandId: id } } : r,
      ),
    };
  });
}

/**
 * Activate a saved brand by id — or NONE (`null`), which composes a primer of
 * Template + Project only. Reads the newly-active brand back off disk (WP2).
 */
export async function switchBrand(id: string | null): Promise<DomainState> {
  if (id !== null) {
    const current = await persisted();
    if (!current.brands.some((b) => b.id === id)) throw new Error(`unknown brand: ${id}`);
  }
  // Re-check inside the closure — the validated read above may be stale.
  await updateDoc((s) => {
    if (id !== null && !s.brands.some((b) => b.id === id)) return s;
    const activeId = activeRecord(s)?.project.id;
    return {
      ...s,
      // Still recorded at document level: it is the default a project that has
      // never been bound falls back to, and the one a NEW project inherits.
      activeBrandId: id,
      // v5.1 Item 3 — and the brand BINDS to the active project. Choosing a
      // brand here is how a person says "this project is a <brand> project";
      // without the bind the choice would be forgotten the moment they switched
      // away and back, which is exactly the "nothing moves as a unit" complaint.
      projects: s.projects.map((r) =>
        r.project.id === activeId ? { ...r, project: { ...r.project, brandId: id } } : r,
      ),
    };
  });
  await hydrateActive();
  return getDomain();
}

/**
 * Persist an edit to the template the ACTIVE project points at.
 * Callers must hold the run lock — changing the recipe mid-run is the same class
 * of error as changing the style (v3 WP1).
 */
export async function saveTemplate(patch: {
  name?: string;
  body?: string;
  importFormat?: ImportFormat;
  listPrompt?: string;
  promptShape?: string;
  negatives?: string;
}): Promise<DomainState> {
  const name = patch.name?.trim();
  return updateAndMirror(() =>
    updateDoc((s) => {
      const active = activeTemplate(s);
      if (!active) throw new Error('no template selected — pick or create one first');
      return {
        ...s,
        templates: s.templates.map((t) =>
          t.id === active.id
            ? {
                ...t,
                ...(patch.body !== undefined ? { body: patch.body } : {}),
                ...(name ? { name } : {}),
                ...(patch.importFormat ? { importFormat: patch.importFormat } : {}),
                ...(patch.listPrompt !== undefined ? { listPrompt: patch.listPrompt } : {}),
                ...(patch.promptShape !== undefined ? { promptShape: patch.promptShape } : {}),
                ...(patch.negatives !== undefined ? { negatives: patch.negatives } : {}),
              }
            : t,
        ),
      };
    }),
  );
}

/**
 * Create a template AND point the active project at it. Draft-until-Create, the
 * same discipline as brands and projects.
 */
export async function createTemplate(input: {
  name: string;
  importFormat?: ImportFormat;
}): Promise<DomainState> {
  const name = input.name.trim();
  if (!name) throw new Error('template name is required');
  return updateAndMirror(() =>
    updateDoc((s) => {
      const id = uniqueSlug(name, s.templates.map((t) => t.id));
      const activeId = activeRecord(s).project.id;
      // Born in the repo when there is one (WP2): a template that only ever
      // existed in domain.json is the exact loss this work package prevents.
      const repoRoot = activeBrand(s)?.repoRoot;
      return {
        ...s,
        templates: [
          ...s.templates,
          {
            id,
            name,
            body: '',
            importFormat: input.importFormat ?? 'lines',
            ...(repoRoot ? { sourcePath: templateDir(repoRoot, id) } : {}),
          },
        ],
        projects: s.projects.map((r) =>
          r.project.id === activeId ? { ...r, project: { ...r.project, templateId: id } } : r,
        ),
      };
    }),
  );
}

/**
 * Point the ACTIVE project at a template — or at none (`null`). This is a
 * per-PROJECT pointer, not a global selection: §3's `project.json { brand,
 * template }` is what makes "two different projects on one character-sheet
 * recipe" a thing you can express at all.
 */
export async function switchTemplate(id: string | null): Promise<DomainState> {
  if (id !== null) {
    const current = await persisted();
    if (!current.templates.some((t) => t.id === id)) throw new Error(`unknown template: ${id}`);
  }
  // Pointing the project at a template is a change to the PROJECT, so it is
  // mirrored; then the newly-active template is read back off disk.
  await updateAndMirror(() =>
    updateActive((rec) => ({
      ...rec,
      project: { ...rec.project, templateId: id ?? undefined },
    })),
  );
  await hydrateActive();
  return getDomain();
}

/**
 * The primer = compose(active Brand, its Template, active Project) — posted ONCE
 * per conversation. With no template this is byte-identical to the pre-v3 primer.
 */
export async function composePrimer(): Promise<string> {
  const s = await persisted();
  return compose(activeBrand(s), activeTemplate(s), activeRecord(s).project);
}

/**
 * Rename the ACTIVE project's theme (A5).
 *
 * The theme name is not decoration: `makeRunId` slugs it into every run folder
 * (`2026-08-03-1446-smoothies`), and `runs.list` shows it. It has been fixed to
 * the project id since creation, so every batch of a long-lived project lands in
 * folders named after the project rather than after what was actually generated
 * — "smoothies" whether the queue was fruit or Australian animals.
 *
 * Verb-only, deliberately: the CONTEXT rail is already five sections deep, and a
 * sixth control for a field edited once or twice a project is not worth the
 * pixels. `runs.list` still shows the old name on old runs, which is correct —
 * a run folder records what it was called when it ran.
 */
export async function renameTheme(name: string): Promise<DomainState> {
  const next = name.trim();
  if (!next) throw new Error('theme name is required');
  return updateAndMirror(() =>
    updateActive((rec) => ({ ...rec, theme: { ...rec.theme, name: next } })),
  );
}

/* ── A7: deletes ──────────────────────────────────────────────────────
 *
 * All three remove a record from `domain.json` and NOTHING from disk. With a
 * repo attached the files under `projects/<id>/` and `templates/<id>/` are the
 * source of truth and are tracked in git; deleting them here would destroy
 * committed work from a confirm dialog, and the app is not the right place to
 * delete something git is holding. Re-attaching the repo imports it all back —
 * which is exactly the property that makes forgetting safe.
 *
 * Each refuses rather than cascading a silent change into a primer. That is the
 * same rule `activeTemplate` follows for a dangling pointer: a wrong recipe is
 * worse than a missing one, and worst of all is one that changed without saying.
 */

/**
 * Forget a brand. If it was the active one the selection becomes `(none)` —
 * which A1 made expressible, and is the only honest answer: substituting the
 * next brand in the list would put an unchosen look into the next primer.
 */
export async function deleteBrand(id: string): Promise<DomainState> {
  const current = await persisted();
  if (!current.brands.some((b) => b.id === id)) throw new Error(`unknown brand: ${id}`);
  return updateDoc((s) => ({
    ...s,
    brands: s.brands.filter((b) => b.id !== id),
    activeBrandId: s.activeBrandId === id ? null : s.activeBrandId,
  }));
}

/**
 * Forget a template. Refused while any project still points at it, naming them:
 * clearing those pointers would silently drop the recipe — and its `negatives`,
 * which are hard constraints — out of primers nobody was editing at the time.
 */
export async function deleteTemplate(id: string): Promise<DomainState> {
  const current = await persisted();
  if (!current.templates.some((t) => t.id === id)) throw new Error(`unknown template: ${id}`);
  const users = current.projects
    .filter((r) => r.project.templateId === id)
    .map((r) => r.project.id);
  if (users.length > 0) {
    throw new Error(
      `template ${id} is still used by ${users.join(', ')} — switch each project to (none) first`,
    );
  }
  return updateDoc((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }));
}

/**
 * Forget a project, and its queue with it. Refused for the LAST project: the
 * cockpit has no "no project" state — `DomainState.project` is non-null
 * everywhere — so an empty list is a crash, not a blank slate.
 *
 * Deleting the ACTIVE project activates the first one left. That is a
 * substitution, unlike the brand case, and it is the right one here: something
 * has to be active, and the alternative is a broken window.
 */
export async function deleteProject(id: string): Promise<DomainState> {
  const current = await persisted();
  if (!current.projects.some((r) => r.project.id === id)) {
    throw new Error(`unknown project: ${id}`);
  }
  if (current.projects.length < 2) {
    throw new Error('cannot delete the last project — create another one first');
  }
  await updateDoc((s) => {
    const projects = s.projects.filter((r) => r.project.id !== id);
    // Guard again inside the closure: the validated read above may be stale.
    if (projects.length === 0) return s;
    return {
      ...s,
      projects,
      activeProjectId:
        s.activeProjectId === id ? projects[0].project.id : s.activeProjectId,
    };
  });
  // The newly-active project is read back off disk, exactly as switchProject does.
  await hydrateActive();
  return getDomain();
}

/** The active theme prompts, in order — the run queue snapshot source. */
export async function getQueue(): Promise<Prompt[]> {
  return activeRecord(await persisted()).theme.prompts;
}

/** Re-queue every prompt (clear harvested status) so a theme can be run again. */
export async function resetRun(): Promise<DomainState> {
  return updateAndMirror(() =>
    updateActive((rec) => ({
      ...rec,
      theme: {
        ...rec.theme,
        prompts: rec.theme.prompts.map((p) => ({
          ...p,
          status: 'queued' as const,
          savedPath: undefined,
        })),
      },
    })),
  );
}

/**
 * Mark one prompt harvested + record where FileAuthor routed it.
 * The repo mirror is QUIET here: this is the run path, and a run must never die
 * because a repo write failed. `domain.json` still holds the truth either way.
 */
export async function markHarvested(promptId: string, savedPath: string): Promise<DomainState> {
  return updateAndMirror(
    () =>
      updateActive((rec) => ({
        ...rec,
        theme: {
          ...rec.theme,
          prompts: rec.theme.prompts.map((p) =>
            p.id === promptId ? { ...p, status: 'harvested', savedPath } : p,
          ),
        },
      })),
    true,
  );
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
  return updateAndMirror(() =>
    updateDoc((s) => {
      const id = uniqueSlug(name, s.projects.map((r) => r.project.id));
      const brand = activeBrand(s);
      const repoRoot = brand?.repoRoot;
      const record: ProjectRecord = {
        project: {
          id,
          name,
          body: '',
          // Bound at BIRTH from the brand in play. This is not the inference
          // this field refuses to make: guessing a brand for a record created
          // months ago is a guess, capturing the one the operator is standing
          // in as they create it is a choice. `null` when that is "(none)" —
          // an explicit no-brand, not an absence of information.
          brandId: brand?.id ?? null,
          // WP3's folder convention: with a repo attached, runs land in
          // `<repo>/projects/<project>/runs/<run-id>/`, beside the project's
          // own files rather than off in ~/Pictures. Without one, the v2
          // default stands. An explicit choice always wins over both.
          outputDir:
            input.outputDir?.trim() ||
            (repoRoot ? repoRunsDir(repoRoot, id) : defaultProjectDir(outputRoot(), name)),
          // Born in the repo when there is one (WP2).
          ...(repoRoot ? { sourcePath: projectDir(repoRoot, id) } : {}),
        },
        theme: { name: id, prompts: [] },
      };
      return { ...s, projects: [...s.projects, record], activeProjectId: id };
    }),
  );
}

/** Activate a saved project by id — and read it back off disk (WP2). */
export async function switchProject(id: string): Promise<DomainState> {
  const current = await persisted();
  if (!current.projects.some((r) => r.project.id === id)) {
    throw new Error(`unknown project: ${id}`);
  }
  // Re-check inside the closure — the validated read above may be stale.
  await updateDoc((s) =>
    s.projects.some((r) => r.project.id === id) ? { ...s, activeProjectId: id } : s,
  );
  await hydrateActive();
  return getDomain();
}

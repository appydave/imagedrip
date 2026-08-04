import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandDesignPath, projectDir, templateDir } from '../src/main/repo-store';

/**
 * WP2's acceptance, end to end:
 *
 *   "delete domain.json, re-point at the repo, and lose nothing but window state."
 *
 * The store is exercised for real against a temp userData + a temp repo, with
 * only `electron` mocked — the same shape as `domain-store.test.ts`.
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_REPO_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_REPO_TEST_DIR not set');
        return j(base, name);
      },
    },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-store-repo-'));
process.env.IMAGEDRIP_REPO_TEST_DIR = base;
const userData = join(base, 'userData');
const repo = join(base, 'i-beauty-and-joy');

const RECIPE = 'A 5-view turnaround, 6 expressions, and a colour palette strip.';
const SUBJECT = 'Subject: the spring nail collection.';
const QUEUE = ['almond ombre | almond ombre in soft pink', 'french tip | a french tip, gold line'].join(
  '\n',
);

beforeAll(async () => {
  await fs.mkdir(userData, { recursive: true });
  await fs.mkdir(repo, { recursive: true });
});

describe('attachRepo — publish, then re-import (WP2 acceptance)', () => {
  it('publishes work that only existed in domain.json out to the repo', async () => {
    const store = await import('../src/main/domain-store');

    // Build something real in the app, with no repo attached yet.
    await store.createProject({ name: 'Spring Gallery' });
    await store.saveProject({ body: SUBJECT });
    await store.createTemplate({ name: 'character-sheet', importFormat: 'blocks' });
    await store.saveTemplate({ body: RECIPE, negatives: 'no text, no watermarks' });
    await store.importPrompts(QUEUE, 'add', 'lines');
    await store.markHarvested(
      (await store.getDomain()).theme.prompts[0].id,
      '2026-08-04-1233/almond-ombre.png',
    );

    await store.attachRepo(repo);

    // Everything is now files a human (and git) can see.
    const pDir = projectDir(repo, 'spring-gallery');
    expect(await fs.readFile(join(pDir, 'project.md'), 'utf8')).toBe(SUBJECT);
    expect(await fs.readFile(join(pDir, 'prompts.md'), 'utf8')).toContain('almond ombre');
    const tDir = templateDir(repo, 'character-sheet');
    expect(await fs.readFile(join(tDir, 'template.md'), 'utf8')).toBe(RECIPE);

    // …and the store now holds POINTERS to them.
    const s = await store.getDomain();
    expect(s.project.sourcePath).toBe(pDir);
    expect(s.template?.sourcePath).toBe(tDir);
    expect(s.brand.repoRoot).toBe(repo);
  });

  it('keeps mirroring later edits — a save reaches the repo, not just domain.json', async () => {
    const store = await import('../src/main/domain-store');
    await store.saveProject({ body: 'Subject: the AUTUMN collection.' });
    expect(
      await fs.readFile(join(projectDir(repo, 'spring-gallery'), 'project.md'), 'utf8'),
    ).toBe('Subject: the AUTUMN collection.');
    await store.saveProject({ body: SUBJECT }); // put it back for the reload test
  });

  it('reads an edit made OUTSIDE the app when the project is re-activated', async () => {
    const store = await import('../src/main/domain-store');
    // Simulate David editing project.md in his editor, or a git pull.
    await fs.writeFile(
      join(projectDir(repo, 'spring-gallery'), 'project.md'),
      'Subject: edited in a text editor.',
    );
    await store.switchProject('spring-gallery');
    expect((await store.getDomain()).project.body).toBe('Subject: edited in a text editor.');
    await fs.writeFile(join(projectDir(repo, 'spring-gallery'), 'project.md'), SUBJECT);
    await store.switchProject('spring-gallery');
  });

  it('refuses to edit a brand body that is synced from brand/DESIGN.md', async () => {
    const store = await import('../src/main/domain-store');
    await fs.mkdir(join(repo, 'brand'), { recursive: true });
    await fs.writeFile(brandDesignPath(repo), 'Brand: warm daylight, soft wooden surfaces.');
    await store.attachRepo(repo);

    const s = await store.getDomain();
    expect(s.brand.body).toBe('Brand: warm daylight, soft wooden surfaces.');
    expect(s.brand.sourcePath).toBe(brandDesignPath(repo));
    // The `brand` skill is canonical — a second editable copy is the drift
    // v-aitldr's "do NOT edit here" rule exists to prevent.
    await expect(store.saveBrand({ body: 'sneaky edit' })).rejects.toThrow(/synced from/);
    // Renaming the brand record is still fine — that is app-side identity.
    await expect(store.saveBrand({ name: 'Beauty & Joy' })).resolves.toBeTruthy();
  });

  /** WP3's folder convention, decided by whether a repo is attached. */
  it('defaults a new project’s runs to <repo>/projects/<project>/runs', async () => {
    const store = await import('../src/main/domain-store');
    await store.createProject({ name: 'Summer Menu' });
    expect(await store.getActiveOutputDir()).toBe(join(repo, 'projects', 'summer-menu', 'runs'));
    // …and the project's own files sit beside them, in the same folder.
    expect((await store.getDomain()).project.sourcePath).toBe(projectDir(repo, 'summer-menu'));
  });

  it('still honours an EXPLICIT output folder over the repo default', async () => {
    const store = await import('../src/main/domain-store');
    await store.createProject({ name: 'One Off', outputDir: '/somewhere/deliberate' });
    expect(await store.getActiveOutputDir()).toBe('/somewhere/deliberate');
    await store.switchProject('spring-gallery');
  });
});

/**
 * The acceptance criterion itself. A SECOND store instance is loaded against a
 * userData directory with no domain.json at all — the "I lost it" case — and
 * re-pointed at the repo.
 */
describe('a fresh install re-pointed at the repo loses nothing', () => {
  it('recovers the brand, template, project, queue and harvest state from files', async () => {
    const secondBase = mkdtempSync(join(tmpdir(), 'imagedrip-store-repo2-'));
    await fs.mkdir(join(secondBase, 'userData'), { recursive: true });
    process.env.IMAGEDRIP_REPO_TEST_DIR = secondBase;
    vi.resetModules();

    const store = await import('../src/main/domain-store');
    // A virgin install: the seed demo, and no knowledge of the repo whatsoever.
    const seeded = await store.getDomain();
    expect(seeded.projects.map((p) => p.id)).not.toContain('spring-gallery');

    await store.attachRepo(repo);
    await store.switchProject('spring-gallery');
    const s = await store.getDomain();

    expect(s.brand.body).toBe('Brand: warm daylight, soft wooden surfaces.');
    expect(s.project.body).toBe(SUBJECT);
    expect(s.template?.body).toBe(RECIPE);
    expect(s.template?.negatives).toBe('no text, no watermarks');
    expect(s.template?.importFormat).toBe('blocks');
    expect(s.theme.prompts.map((p) => p.subject)).toEqual(['almond ombre', 'french tip']);

    // Harvest state survives — the run record is not lost with domain.json.
    const harvested = s.theme.prompts.filter((p) => p.status === 'harvested');
    expect(harvested.map((p) => p.savedPath)).toEqual(['2026-08-04-1233/almond-ombre.png']);

    // And the primer composes exactly as it did in the first install.
    expect(await store.composePrimer()).toBe(
      `Brand: warm daylight, soft wooden surfaces.\n\n${RECIPE}\n\nHard constraints — never do any of these:\nno text, no watermarks\n\n${SUBJECT}`,
    );
  });
});

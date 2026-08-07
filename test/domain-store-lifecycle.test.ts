import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A5 (theme.rename) and A7 (the deletes), exercised through the real store.
 *
 * Both exist because the app could CREATE every kind of record and un-create
 * none of them: a mistyped brand, an abandoned template and a scratch project
 * were permanent, and the only way to be rid of one was to hand-edit
 * domain.json. The deletes are deliberately narrow — they forget a record and
 * touch nothing on disk — and each refuses rather than cascading a silent
 * change into somebody's primer.
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_LIFECYCLE_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_LIFECYCLE_TEST_DIR not set');
        return j(base, name);
      },
    },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-lifecycle-'));
process.env.IMAGEDRIP_LIFECYCLE_TEST_DIR = base;

beforeAll(async () => {
  await fs.mkdir(join(base, 'userData'), { recursive: true });
});

describe('theme.rename — A5', () => {
  it('renames the ACTIVE project’s theme and leaves its prompts alone', async () => {
    const store = await import('../src/main/domain-store');
    const before = await store.getDomain();
    expect(before.theme.name).toBe('smoothies'); // defaulted to the project id

    const after = await store.renameTheme('australian-animals');
    expect(after.theme.name).toBe('australian-animals');
    // The queue is untouched — this renames the batch, it does not reset it.
    expect(after.theme.prompts).toHaveLength(before.theme.prompts.length);
    expect(after.theme.prompts[0]?.id).toBe(before.theme.prompts[0]?.id);
  });

  it('trims, and refuses a blank name rather than making run folders nameless', async () => {
    const store = await import('../src/main/domain-store');
    expect((await store.renameTheme('  spaced  ')).theme.name).toBe('spaced');
    await expect(store.renameTheme('   ')).rejects.toThrow(/theme name is required/);
  });

  it('is per-project — renaming one theme does not touch another', async () => {
    const store = await import('../src/main/domain-store');
    await store.createProject({ name: 'Villains' });
    expect((await store.getDomain()).theme.name).toBe('villains');
    await store.renameTheme('pantomime');

    await store.switchProject('smoothies');
    expect((await store.getDomain()).theme.name).toBe('spaced');
    await store.switchProject('villains');
    expect((await store.getDomain()).theme.name).toBe('pantomime');
  });
});

describe('deletes — A7', () => {
  it('forgets a brand, and deselects it when it was active', async () => {
    const store = await import('../src/main/domain-store');
    await store.createBrand({ name: 'Scratch' });
    expect((await store.getDomain()).activeBrandId).toBe('scratch');

    const after = await store.deleteBrand('scratch');
    // Never substitutes the next brand — an unchosen look in the next primer
    // is exactly what "(none)" exists to prevent.
    expect(after.activeBrandId).toBeNull();
    expect(after.brand).toBeNull();
    expect(after.brands.map((b) => b.id)).not.toContain('scratch');
    // The other brand is untouched.
    expect(after.brands.map((b) => b.id)).toContain('beauty-joy');
  });

  it('leaves the active brand alone when a DIFFERENT brand is deleted', async () => {
    const store = await import('../src/main/domain-store');
    await store.createBrand({ name: 'Keeper' });
    await store.createBrand({ name: 'Doomed' });
    await store.switchBrand('keeper');

    const after = await store.deleteBrand('doomed');
    expect(after.activeBrandId).toBe('keeper');
  });

  it('refuses an unknown brand id rather than silently succeeding', async () => {
    const store = await import('../src/main/domain-store');
    await expect(store.deleteBrand('never-existed')).rejects.toThrow(/unknown brand/);
  });

  it('refuses to delete a template a project still points at, naming the project', async () => {
    const store = await import('../src/main/domain-store');
    // The active project is 'villains'; creating a template points it at one.
    await store.createTemplate({ name: 'character-sheet' });
    await store.saveTemplate({ body: 'a 5-view turnaround', negatives: 'no faces' });

    // Clearing the pointer here would silently drop BOTH the recipe and its
    // hard constraints out of that project's primer.
    await expect(store.deleteTemplate('character-sheet')).rejects.toThrow(/still used by/);
    await expect(store.deleteTemplate('character-sheet')).rejects.toThrow(/villains/);

    // The refusal changed nothing.
    const s = await store.getDomain();
    expect(s.activeTemplateId).toBe('character-sheet');
    expect(s.template?.negatives).toBe('no faces');
  });

  it('deletes a template once nothing points at it', async () => {
    const store = await import('../src/main/domain-store');
    await store.switchTemplate(null);
    const after = await store.deleteTemplate('character-sheet');
    expect(after.templates.map((t) => t.id)).not.toContain('character-sheet');
    expect(after.template).toBeNull();
  });

  it('forgets a project and its queue, activating another when it was active', async () => {
    const store = await import('../src/main/domain-store');
    expect((await store.getDomain()).activeProjectId).toBe('villains');

    const after = await store.deleteProject('villains');
    expect(after.projects.map((p) => p.id)).not.toContain('villains');
    expect(after.activeProjectId).toBe('smoothies');
    // The surviving project kept its own theme and queue.
    expect(after.theme.name).toBe('spaced');
    expect(after.theme.prompts.length).toBeGreaterThan(0);
  });

  it('refuses to delete the LAST project — there is no "no project" state', async () => {
    const store = await import('../src/main/domain-store');
    expect((await store.getDomain()).projects).toHaveLength(1);
    await expect(store.deleteProject('smoothies')).rejects.toThrow(/last project/);
    // Still there, still active.
    expect((await store.getDomain()).activeProjectId).toBe('smoothies');
  });

  it('refuses an unknown project id', async () => {
    const store = await import('../src/main/domain-store');
    await expect(store.deleteProject('never-existed')).rejects.toThrow(/unknown project/);
  });
});

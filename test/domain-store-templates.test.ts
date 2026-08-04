import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * WP1's stated acceptance, exercised through the real store:
 *
 *   "create a character-sheet template, point two different projects at it, run
 *    both, and confirm the manifests carry identical template text with
 *    different subjects."
 *
 * The manifest records the primer verbatim (`RunRecorder`), so "identical
 * template text with different subjects" is a property of what `composePrimer`
 * returns for each project — which is what this asserts.
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_TEMPLATES_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_TEMPLATES_TEST_DIR not set');
        return j(base, name);
      },
    },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-templates-'));
process.env.IMAGEDRIP_TEMPLATES_TEST_DIR = base;

const RECIPE = 'A 5-view turnaround, 6 expressions, and a colour palette strip.';

// No domain.json at all — this exercises the fresh-install seed path.
beforeAll(async () => {
  await fs.mkdir(join(base, 'userData'), { recursive: true });
});

describe('templates in the store (WP1 acceptance)', () => {
  it('points two different projects at one template and composes both primers', async () => {
    const store = await import('../src/main/domain-store');

    // A fresh install seeds one project with NO template — its primer is the
    // pre-v3 two-part composition, and that is the baseline we compare against.
    const seeded = await store.getDomain();
    expect(seeded.template).toBeNull();
    expect(seeded.activeTemplateId).toBeNull();
    const brandBody = seeded.brand.body;
    const primerWithoutTemplate = await store.composePrimer();
    expect(primerWithoutTemplate).toBe(`${brandBody}\n\n${seeded.project.body}`);

    // Create the recipe. Creating points the ACTIVE project at it.
    await store.createTemplate({ name: 'character-sheet', importFormat: 'blocks' });
    await store.saveTemplate({ body: RECIPE });
    const withTemplate = await store.getDomain();
    expect(withTemplate.activeTemplateId).toBe('character-sheet');
    expect(withTemplate.template?.importFormat).toBe('blocks');

    // Project A — subject: heroes.
    await store.saveProject({ name: 'Heroes', body: 'Subject: Filipino national heroes.' });
    const primerA = await store.composePrimer();

    // Project B — a different subject, pointed at the SAME template.
    await store.createProject({ name: 'Villains' });
    await store.saveProject({ body: 'Subject: pantomime villains.' });
    expect((await store.getDomain()).activeTemplateId).toBeNull(); // new projects start clean
    await store.switchTemplate('character-sheet');
    const primerB = await store.composePrimer();

    // Identical recipe, different subjects — the whole point of the split.
    expect(primerA).toBe(`${brandBody}\n\n${RECIPE}\n\nSubject: Filipino national heroes.`);
    expect(primerB).toBe(`${brandBody}\n\n${RECIPE}\n\nSubject: pantomime villains.`);
    expect(primerA).not.toBe(primerB);
    expect(primerA).toContain(RECIPE);
    expect(primerB).toContain(RECIPE);
  });

  it('un-pointing a project restores the pre-v3 primer exactly', async () => {
    const store = await import('../src/main/domain-store');
    await store.switchTemplate(null);
    const s = await store.getDomain();
    expect(s.template).toBeNull();
    expect(await store.composePrimer()).toBe(`${s.brand.body}\n\n${s.project.body}`);
  });

  it('refuses to save when the project points at no template', async () => {
    const store = await import('../src/main/domain-store');
    await expect(store.saveTemplate({ body: 'orphan' })).rejects.toThrow(/no template selected/);
  });

  it('refuses an unknown template id rather than silently pointing at nothing', async () => {
    const store = await import('../src/main/domain-store');
    await expect(store.switchTemplate('does-not-exist')).rejects.toThrow(/unknown template/);
  });

  it('keeps template ids unique, so two same-named recipes stay distinct', async () => {
    const store = await import('../src/main/domain-store');
    await store.createTemplate({ name: 'character-sheet' });
    const s = await store.getDomain();
    expect(s.templates.map((t) => t.id)).toContain('character-sheet-2');
    // The original recipe text is untouched by the second creation.
    expect(s.templates).toHaveLength(2);
  });
});

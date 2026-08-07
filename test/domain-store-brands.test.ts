import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A1 — "(none)" is a real brand selection, exercised through the real store.
 *
 * The defect this closes: a fresh install seeds one demo brand ("Beauty & Joy")
 * and the switcher was DISABLED below two brands, so there was no way to stop
 * putting that brand's look into every primer. Brand now mirrors Template
 * exactly — nullable id, nullable record, `switchBrand(null)` — and the
 * composition guarantee is the same one templates already hold: the layer drops
 * out cleanly and the others are byte-identical to what they'd be alone.
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_BRANDS_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_BRANDS_TEST_DIR not set');
        return j(base, name);
      },
    },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-brands-'));
process.env.IMAGEDRIP_BRANDS_TEST_DIR = base;

const RECIPE = 'A 5-view turnaround, 6 expressions, and a colour palette strip.';

// No domain.json at all — the fresh-install seed path, which is exactly the
// state the disabled switcher used to trap.
beforeAll(async () => {
  await fs.mkdir(join(base, 'userData'), { recursive: true });
});

describe('brand can be (none) — A1', () => {
  it('starts on the seeded brand, and can be switched off it', async () => {
    const store = await import('../src/main/domain-store');

    const seeded = await store.getDomain();
    expect(seeded.activeBrandId).toBe('beauty-joy');
    expect(seeded.brand?.name).toBe('Beauty & Joy');

    const none = await store.switchBrand(null);
    expect(none.activeBrandId).toBeNull();
    expect(none.brand).toBeNull();
    // The brand itself is not deleted — only de-selected. It is still listed.
    expect(none.brands.map((b) => b.id)).toContain('beauty-joy');
  });

  it('composes a primer of Template + Project, byte-identical to having neither brand nor a brand layer', async () => {
    const store = await import('../src/main/domain-store');
    await store.createTemplate({ name: 'character-sheet', importFormat: 'blocks' });
    await store.saveTemplate({ body: RECIPE });
    await store.saveProject({ body: 'Subject: Filipino national heroes.' });

    const s = await store.getDomain();
    expect(s.brand).toBeNull();
    expect(await store.composePrimer()).toBe(`${RECIPE}\n\n${s.project.body}`);
  });

  it('composes the project body ALONE when brand and template are both none', async () => {
    const store = await import('../src/main/domain-store');
    await store.switchTemplate(null);
    const s = await store.getDomain();
    expect(await store.composePrimer()).toBe(s.project.body);
  });

  it('restores the branded primer exactly when a brand is selected again', async () => {
    const store = await import('../src/main/domain-store');
    const s = await store.switchBrand('beauty-joy');
    expect(s.activeBrandId).toBe('beauty-joy');
    expect(await store.composePrimer()).toBe(`${s.brand?.body}\n\n${s.project.body}`);
  });

  it('refuses to save a brand while none is selected, rather than silently dropping the edit', async () => {
    const store = await import('../src/main/domain-store');
    await store.switchBrand(null);
    await expect(store.saveBrand({ body: 'orphan' })).rejects.toThrow(/no brand selected/);
    await expect(store.saveBrand({ name: 'orphan' })).rejects.toThrow(/no brand selected/);
  });

  it('refuses to attach a repo while none is selected — a repo belongs to a brand', async () => {
    const store = await import('../src/main/domain-store');
    await expect(store.attachRepo(join(base, 'some-repo'))).rejects.toThrow(/no brand selected/);
  });

  it('still refuses an unknown brand id rather than silently selecting nothing', async () => {
    const store = await import('../src/main/domain-store');
    await expect(store.switchBrand('does-not-exist')).rejects.toThrow(/unknown brand/);
    // …and the refusal left the selection where it was.
    expect((await store.getDomain()).activeBrandId).toBeNull();
  });

  it('creating a brand from (none) activates it', async () => {
    const store = await import('../src/main/domain-store');
    const s = await store.createBrand({ name: 'Challenge DV' });
    expect(s.activeBrandId).toBe('challenge-dv');
    expect(s.brand?.name).toBe('Challenge DV');
  });
});

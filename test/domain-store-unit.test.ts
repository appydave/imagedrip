import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * v5.1 Item 3 — the project is the UNIT, and the brand travels with it.
 *
 * David: *"the dropdowns and the prompt list are disconnected — change the brand
 * and only the brand changes."* A ProjectRecord already carried the recipe, the
 * subject, the prompt list and the output folder, and `project.switch` already
 * moved all four. The brand was the one axis stored somewhere else, so it stayed
 * put while everything around it moved.
 *
 * `Project.brandId` closes that, and the brand is DERIVED from it rather than
 * synced alongside it — two fields kept in step by hand drift, and a brand that
 * drifts is a wrong look in a primer nobody edited.
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_UNIT_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_UNIT_TEST_DIR not set');
        return j(base, name);
      },
    },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-unit-'));
process.env.IMAGEDRIP_UNIT_TEST_DIR = base;

beforeAll(async () => {
  await fs.mkdir(join(base, 'userData'), { recursive: true });
});

describe('the brand travels with the project', () => {
  it('binds the brand to the project it was chosen on, and brings it back on return', async () => {
    const store = await import('../src/main/domain-store');

    // Both brands up front. NOTE the semantics being exercised: `createBrand`
    // binds the project you are standing on, exactly as `createTemplate`
    // already repoints it — so the brands are made first and each unit is then
    // pointed at one deliberately, which is the real flow.
    await store.createBrand({ name: 'Joy Juice' });
    const juice = (await store.getDomain()).activeBrandId;
    await store.createBrand({ name: 'AppyDave' });
    const appydave = (await store.getDomain()).activeBrandId;

    await store.createProject({ name: 'Fruit Juices' });
    const juiceProject = (await store.getDomain()).activeProjectId;
    await store.switchBrand(juice);

    await store.createProject({ name: 'Thumbnails' });
    const thumbProject = (await store.getDomain()).activeProjectId;
    await store.switchBrand(appydave);

    // THE ASK: select one thing, and the brand comes with it.
    const back = await store.switchProject(juiceProject);
    expect(back.activeBrandId).toBe(juice);
    expect(back.brand?.name).toBe('Joy Juice');

    const forward = await store.switchProject(thumbProject);
    expect(forward.activeBrandId).toBe(appydave);
    expect(forward.brand?.name).toBe('AppyDave');
  });

  it('a new project is born bound to the brand in play', async () => {
    const store = await import('../src/main/domain-store');
    await store.createBrand({ name: 'Beauty Salon' });
    const salon = (await store.getDomain()).activeBrandId;

    const created = await store.createProject({ name: 'Spring Nails' });
    expect(created.activeBrandId).toBe(salon);
    expect(created.project.brandId).toBe(salon);
  });

  it('switching the brand REBINDS the active project — the choice is not forgotten', async () => {
    // Without the bind, choosing a brand would survive only until you switched
    // away and back, which is the "nothing moves as a unit" complaint itself.
    const store = await import('../src/main/domain-store');
    await store.createBrand({ name: 'Before' });
    await store.createProject({ name: 'Rebind Me' });
    const project = (await store.getDomain()).activeProjectId;

    await store.createBrand({ name: 'After' });
    const after = (await store.getDomain()).activeBrandId;
    await store.switchProject(project);
    await store.switchBrand(after);

    // Leave and come back — the rebind stuck.
    await store.createProject({ name: 'Somewhere Else' });
    const returned = await store.switchProject(project);
    expect(returned.activeBrandId).toBe(after);
  });

  it('carries an explicit (none) back too, and does not fall back to a default', async () => {
    // `null` is a CHOICE and must survive a round trip. Falling back to the
    // document default here would put an unchosen look into the primer — the
    // exact substitution `activeBrand()` refuses to make.
    const store = await import('../src/main/domain-store');
    await store.createBrand({ name: 'Loud Brand' });
    const loud = (await store.getDomain()).activeBrandId;

    await store.createProject({ name: 'Deliberately Brandless' });
    const brandless = (await store.getDomain()).activeProjectId;
    await store.switchBrand(null);
    expect((await store.getDomain()).brand).toBeNull();

    await store.createProject({ name: 'Loud Project' });
    await store.switchBrand(loud);
    expect((await store.getDomain()).brand?.name).toBe('Loud Brand');

    const back = await store.switchProject(brandless);
    expect(back.activeBrandId).toBeNull();
    expect(back.brand).toBeNull();
  });

  it('a project that has never been bound still follows the document default', async () => {
    // The back-compat guarantee. Every project on disk today has no `brandId`,
    // and must behave exactly as it did before the field existed — otherwise
    // the field is a migration wearing a widening's clothes.
    const store = await import('../src/main/domain-store');
    const { migrateDomain } = await import('../src/main/domain-migrate');

    const legacy = migrateDomain(
      {
        version: 4,
        brands: [{ id: 'legacy-brand', name: 'Legacy', body: 'LOOK' }],
        activeBrandId: 'legacy-brand',
        templates: [],
        projects: [
          {
            // No brandId — and an outputDir, so `fixProjects` has nothing to
            // backfill and `migrated` reports only on the field under test.
            project: { id: 'old', name: 'Old', body: 'SUBJECT', outputDir: '/tmp/old' },
            theme: { name: 'old', prompts: [] },
          },
        ],
        activeProjectId: 'old',
      },
      base,
    );

    expect(legacy.migrated).toBe(false); // a WIDENING — no rewrite, no .bak
    expect(legacy.state.projects[0].project.brandId).toBeUndefined();
  });
});

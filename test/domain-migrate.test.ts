import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  defaultProjectDir,
  migrateDomain,
  seedDefaults,
  uniqueSlug,
  type PersistedDomain,
} from '../src/main/domain-migrate';
import { compose } from '../src/shared/domain';

const ROOT = '/tmp/pictures/ImageDrip';

describe('uniqueSlug', () => {
  it('slugifies and avoids collisions with -2, -3…', () => {
    expect(uniqueSlug('Winter Theme', [])).toBe('winter-theme');
    expect(uniqueSlug('Winter Theme', ['winter-theme'])).toBe('winter-theme-2');
    expect(uniqueSlug('Winter Theme', ['winter-theme', 'winter-theme-2'])).toBe('winter-theme-3');
  });
});

describe('migrateDomain', () => {
  const v1 = {
    brand: { name: 'Beauty & Joy', body: 'brand body' },
    project: { name: 'Smoothies', body: 'project body' },
    theme: {
      name: 'smoothies',
      prompts: [
        { id: 'kangaroo-1', subject: 'kangaroo', text: 'kangaroo', status: 'harvested' as const },
        { id: 'koala-2', subject: 'koala', text: 'koala', status: 'queued' as const },
      ],
    },
  };

  it('upgrades a v1 document losslessly to v4', () => {
    const { state, migrated } = migrateDomain(v1, ROOT);
    expect(migrated).toBe(true);
    expect(state.version).toBe(4);
    // The single brand becomes the first (active) brand record.
    expect(state.brands).toHaveLength(1);
    expect(state.brands[0]).toEqual({ id: 'beauty-joy', name: 'Beauty & Joy', body: 'brand body' });
    expect(state.activeBrandId).toBe('beauty-joy');
    // The single project becomes the first (active) project record.
    expect(state.projects).toHaveLength(1);
    const rec = state.projects[0];
    expect(rec.project.id).toBe('smoothies');
    expect(rec.project.body).toBe('project body');
    expect(rec.project.outputDir).toBe(join(ROOT, 'smoothies'));
    // The existing queue — including harvested state — survives untouched.
    expect(rec.theme).toEqual(v1.theme);
    expect(state.activeProjectId).toBe('smoothies');
  });

  it('upgrades a v2 document (v2 WP1 shape) to v4, lifting the brand', () => {
    const v2 = {
      version: 2 as const,
      brand: { name: 'Beauty & Joy', body: 'brand body' },
      projects: [
        {
          project: { id: 'smoothies', name: 'Smoothies', body: 'b', outputDir: '/custom' },
          theme: { name: 'smoothies', prompts: [] },
        },
      ],
      activeProjectId: 'smoothies',
    };
    const { state, migrated } = migrateDomain(v2, ROOT);
    expect(migrated).toBe(true);
    expect(state.version).toBe(4);
    expect(state.brands[0].id).toBe('beauty-joy');
    expect(state.activeBrandId).toBe('beauty-joy');
    expect(state.projects[0].project.outputDir).toBe('/custom');
  });

  it('keeps an explicit v1 outputDir instead of the default', () => {
    const withDir = { ...v1, project: { ...v1.project, outputDir: '/custom/place' } };
    const { state } = migrateDomain(withDir, ROOT);
    expect(state.projects[0].project.outputDir).toBe('/custom/place');
  });

  it('passes a v4 document through unchanged', () => {
    const v4 = seedDefaults(ROOT);
    const { state, migrated } = migrateDomain(v4, ROOT);
    expect(migrated).toBe(false);
    expect(state).toEqual(v4);
  });

  it('backfills a v4 record missing project id/outputDir or brand id', () => {
    const v4 = seedDefaults(ROOT);
    const broken: PersistedDomain = {
      ...v4,
      brands: [{ ...v4.brands[0], id: '' }],
      projects: [
        {
          ...v4.projects[0],
          project: { ...v4.projects[0].project, id: '', outputDir: undefined },
        },
      ],
    };
    const { state, migrated } = migrateDomain(broken, ROOT);
    expect(migrated).toBe(true);
    expect(state.brands[0].id).toBe('beauty-joy');
    expect(state.projects[0].project.id).toBe('smoothies');
    expect(state.projects[0].project.outputDir).toBe(defaultProjectDir(ROOT, 'Smoothies'));
  });

  it('seeds defaults ONLY for a truly absent document', () => {
    const { state, migrated } = migrateDomain(null, ROOT);
    expect(migrated).toBe(true);
    expect(state.version).toBe(4);
    expect(state.brands.length).toBeGreaterThan(0);
    expect(state.projects.length).toBeGreaterThan(0);
    // A fresh install starts with NO templates and no project pointing at one,
    // so its primer matches a migrated install's exactly.
    expect(state.templates).toEqual([]);
    expect(state.projects[0].project.templateId).toBeUndefined();
  });

  /**
   * v3 → v4 (v3 WP1). The whole point of this step is that it must be INVISIBLE:
   * the template library appears, empty, and nothing else moves — including the
   * primer every existing project posts.
   */
  describe('v3 → v4 (templates)', () => {
    const v3 = {
      version: 3 as const,
      brands: [{ id: 'beauty-joy', name: 'Beauty & Joy', body: 'brand body' }],
      activeBrandId: 'beauty-joy',
      projects: [
        {
          project: {
            id: 'smoothies',
            name: 'Smoothies',
            body: 'project body',
            outputDir: '/custom',
          },
          theme: {
            name: 'smoothies',
            prompts: [
              {
                id: 'kangaroo-1',
                subject: 'kangaroo',
                text: 'kangaroo',
                status: 'harvested' as const,
                savedPath: '2026-08-04-1233/kangaroo.png',
              },
            ],
          },
        },
      ],
      activeProjectId: 'smoothies',
    };

    it('adds an EMPTY template library and points no project at one', () => {
      const { state, migrated } = migrateDomain(v3, ROOT);
      expect(migrated).toBe(true);
      expect(state.version).toBe(4);
      expect(state.templates).toEqual([]);
      expect(state.projects[0].project.templateId).toBeUndefined();
    });

    it('leaves brands, projects, queues and harvest state untouched', () => {
      const { state } = migrateDomain(v3, ROOT);
      expect(state.brands).toEqual(v3.brands);
      expect(state.activeBrandId).toBe('beauty-joy');
      expect(state.activeProjectId).toBe('smoothies');
      expect(state.projects[0].theme).toEqual(v3.projects[0].theme);
      expect(state.projects[0].project.body).toBe('project body');
      expect(state.projects[0].project.outputDir).toBe('/custom');
    });

    it('composes the SAME primer before and after the upgrade', () => {
      const { state } = migrateDomain(v3, ROOT);
      const before = [v3.brands[0].body, v3.projects[0].project.body].join('\n\n');
      expect(compose(state.brands[0], null, state.projects[0].project)).toBe(before);
    });

    it('is idempotent — re-running on the result changes nothing', () => {
      const { state } = migrateDomain(v3, ROOT);
      const again = migrateDomain(state, ROOT);
      expect(again.migrated).toBe(false);
      expect(again.state).toEqual(state);
    });

    it('backfills a v4 template missing an id or importFormat', () => {
      const v4 = seedDefaults(ROOT);
      const broken = {
        ...v4,
        templates: [{ id: '', name: 'Character Sheet', body: 'recipe' }],
      } as unknown as PersistedDomain;
      const { state, migrated } = migrateDomain(broken, ROOT);
      expect(migrated).toBe(true);
      expect(state.templates[0].id).toBe('character-sheet');
      // `lines` is the fallback because it is what every import did pre-v3.
      expect(state.templates[0].importFormat).toBe('lines');
    });

    it('keeps a template a project already points at', () => {
      const v4: PersistedDomain = {
        ...seedDefaults(ROOT),
        templates: [
          { id: 'character-sheet', name: 'character-sheet', body: 'recipe', importFormat: 'blocks' },
        ],
      };
      v4.projects[0].project.templateId = 'character-sheet';
      const { state, migrated } = migrateDomain(v4, ROOT);
      expect(migrated).toBe(false);
      expect(state.projects[0].project.templateId).toBe('character-sheet');
      expect(state.templates[0].importFormat).toBe('blocks');
    });
  });

  it('REFUSES to seed-overwrite a parsed-but-unrecognizable document (advisory-1 #3)', () => {
    // A v1-shaped doc carrying a stray version key fails all three guards —
    // previously it was silently replaced with the demo seed.
    const v1WithVersion = { ...v1, version: 9 };
    expect(() => migrateDomain(v1WithVersion, ROOT)).toThrow(/refusing to overwrite/);
    // A v2 doc with a null activeProjectId must also fail loud, not wipe.
    const v2Broken = { version: 2, brand: v1.brand, projects: [], activeProjectId: null };
    expect(() => migrateDomain(v2Broken, ROOT)).toThrow(/refusing to overwrite/);
    expect(() => migrateDomain({ garbage: true }, ROOT)).toThrow(/refusing to overwrite/);
  });
});

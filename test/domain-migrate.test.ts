import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  defaultProjectDir,
  migrateDomain,
  seedDefaults,
  uniqueProjectId,
  type PersistedDomain,
} from '../src/main/domain-migrate';

const ROOT = '/tmp/pictures/ImageDrip';

describe('uniqueProjectId', () => {
  it('slugifies and avoids collisions with -2, -3…', () => {
    expect(uniqueProjectId('Winter Theme', [])).toBe('winter-theme');
    expect(uniqueProjectId('Winter Theme', ['winter-theme'])).toBe('winter-theme-2');
    expect(uniqueProjectId('Winter Theme', ['winter-theme', 'winter-theme-2'])).toBe(
      'winter-theme-3',
    );
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

  it('upgrades a v1 document losslessly', () => {
    const { state, migrated } = migrateDomain(v1, ROOT);
    expect(migrated).toBe(true);
    expect(state.version).toBe(2);
    expect(state.projects).toHaveLength(1);
    const rec = state.projects[0];
    expect(rec.project.id).toBe('smoothies');
    expect(rec.project.name).toBe('Smoothies');
    expect(rec.project.body).toBe('project body');
    expect(rec.project.outputDir).toBe(join(ROOT, 'smoothies'));
    // The existing queue — including harvested state — survives untouched.
    expect(rec.theme).toEqual(v1.theme);
    expect(state.activeProjectId).toBe('smoothies');
    expect(state.brand).toEqual(v1.brand);
  });

  it('keeps an explicit v1 outputDir instead of the default', () => {
    const withDir = { ...v1, project: { ...v1.project, outputDir: '/custom/place' } };
    const { state } = migrateDomain(withDir, ROOT);
    expect(state.projects[0].project.outputDir).toBe('/custom/place');
  });

  it('passes a v2 document through unchanged', () => {
    const v2 = seedDefaults(ROOT);
    const { state, migrated } = migrateDomain(v2, ROOT);
    expect(migrated).toBe(false);
    expect(state).toEqual(v2);
  });

  it('backfills a v2 record missing id/outputDir', () => {
    const v2 = seedDefaults(ROOT);
    const broken: PersistedDomain = {
      ...v2,
      projects: [
        {
          ...v2.projects[0],
          project: { ...v2.projects[0].project, id: '', outputDir: undefined },
        },
      ],
    };
    const { state, migrated } = migrateDomain(broken, ROOT);
    expect(migrated).toBe(true);
    expect(state.projects[0].project.id).toBe('smoothies');
    expect(state.projects[0].project.outputDir).toBe(defaultProjectDir(ROOT, 'Smoothies'));
  });

  it('falls back to seed defaults on unrecognizable input', () => {
    const { state, migrated } = migrateDomain(null, ROOT);
    expect(migrated).toBe(true);
    expect(state.version).toBe(2);
    expect(state.projects.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * domain-store against a real @appydave/core Store on a temp dir, with only
 * `electron` mocked. Covers advisory-1 #2 (concurrent saves must BOTH survive —
 * every update derives from the closure argument, not a stale snapshot) and
 * #3 (a timestamped .bak lands before any migrating write).
 */

vi.mock('electron', async () => {
  const { join: j } = await import('node:path');
  return {
    app: {
      getPath: (name: string): string => {
        const base = process.env.IMAGEDRIP_TEST_DIR;
        if (!base) throw new Error('IMAGEDRIP_TEST_DIR not set');
        return j(base, name);
      },
    },
  };
});

const base = mkdtempSync(join(tmpdir(), 'imagedrip-domain-'));
process.env.IMAGEDRIP_TEST_DIR = base;
const userData = join(base, 'userData');

const V1_DOC = {
  brand: { name: 'Real Brand', body: 'real brand body' },
  project: { name: 'Real Project', body: 'real project body' },
  theme: {
    name: 'real-theme',
    prompts: [
      { id: 'kangaroo-1', subject: 'kangaroo', text: 'kangaroo', status: 'harvested' },
      { id: 'koala-2', subject: 'koala', text: 'koala', status: 'queued' },
    ],
  },
};

beforeAll(async () => {
  // Seed a REAL v1 domain.json before the store is ever touched.
  await fs.mkdir(userData, { recursive: true });
  await fs.writeFile(join(userData, 'domain.json'), JSON.stringify(V1_DOC, null, 2));
});

describe('domain-store (electron mocked, real Store)', () => {
  it('migrates the v1 file in place, taking a .bak first (advisory-1 #3)', async () => {
    const store = await import('../src/main/domain-store');
    const s = await store.getDomain();
    // Lossless: David's real content survives the v1 → v3 upgrade.
    expect(s.brand.name).toBe('Real Brand');
    expect(s.project.name).toBe('Real Project');
    expect(s.theme.prompts).toHaveLength(2);
    expect(s.theme.prompts[0].status).toBe('harvested');
    // The restore point exists next to the file.
    const files = await fs.readdir(userData);
    const baks = files.filter((f) => f.startsWith('domain.json.') && f.endsWith('.bak'));
    expect(baks.length).toBeGreaterThan(0);
    const bak = JSON.parse(await fs.readFile(join(userData, baks[0]), 'utf8'));
    expect(bak).toEqual(V1_DOC); // the .bak is the PRE-migration document
  });

  it('two concurrent autosaves both survive (advisory-1 #2)', async () => {
    const store = await import('../src/main/domain-store');
    // Brand and Project debounces firing together — the WP2 autosave race.
    await Promise.all([
      store.saveBrand({ body: 'BRAND-EDIT' }),
      store.saveProject({ body: 'PROJECT-EDIT' }),
    ]);
    const s = await store.getDomain();
    expect(s.brand.body).toBe('BRAND-EDIT');
    expect(s.project.body).toBe('PROJECT-EDIT');
  });

  it('two concurrent patches to the SAME record both survive', async () => {
    const store = await import('../src/main/domain-store');
    await Promise.all([
      store.saveProject({ name: 'Renamed Project' }),
      store.saveProject({ body: 'PROJECT-EDIT-2' }),
    ]);
    const s = await store.getDomain();
    expect(s.project.name).toBe('Renamed Project');
    expect(s.project.body).toBe('PROJECT-EDIT-2');
  });
});

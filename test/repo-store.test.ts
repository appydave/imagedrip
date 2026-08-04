import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brandDesignPath,
  ensureScaffolds,
  parsePromptsFile,
  projectDir,
  readProject,
  readRepo,
  readTemplate,
  repoRootOf,
  repoRunsDir,
  serializePrompts,
  templateDir,
  writeProject,
  writeTemplate,
} from '../src/main/repo-store';
import type { ProjectRecord } from '../src/main/domain-migrate';
import type { Prompt, Template } from '../src/shared/domain';

/**
 * The brand repo on disk (v3 WP2). Everything here is round-trip: what the app
 * writes must be exactly what it reads back, because after WP2 the files are
 * the source of truth and `domain.json` is only an index of pointers.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'imagedrip-repo-'));
});

const template: Template = {
  id: 'character-sheet',
  name: 'Character Sheet',
  body: 'A 5-view turnaround, 6 expressions, and a colour palette strip.',
  importFormat: 'blocks',
  listPrompt: 'List {count} {subject}, one per line.',
  negatives: 'no AI-fabricated survivors, faces, or testimonials',
};

function record(prompts: Prompt[]): ProjectRecord {
  return {
    project: {
      id: 'spring-gallery',
      name: 'Spring Gallery',
      body: 'Subject: the spring nail collection.',
      templateId: 'character-sheet',
    },
    theme: { name: 'spring-gallery', prompts },
  };
}

const QUEUE: Prompt[] = [
  { id: 'almond-ombre-1', subject: 'almond ombre', text: 'almond ombre in soft pink', status: 'queued' },
  {
    id: 'french-tip-2',
    subject: 'french tip',
    text: 'a french tip\nwith a gold accent line\nand a matte finish',
    status: 'harvested',
    savedPath: '2026-08-04-1233/french-tip.png',
  },
];

describe('repoRootOf', () => {
  it('recovers the repo root from a record’s own sourcePath', () => {
    expect(repoRootOf(templateDir(root, 'x'))).toBe(root);
    expect(repoRootOf(projectDir(root, 'x'))).toBe(root);
  });
});

describe('prompts.md round trip', () => {
  it('preserves subject and multi-line body verbatim', () => {
    const back = parsePromptsFile(serializePrompts(QUEUE));
    expect(back.map((p) => p.subject)).toEqual(['almond ombre', 'french tip']);
    expect(back.map((p) => p.text)).toEqual(QUEUE.map((p) => p.text));
  });

  it('survives a subject containing the block delimiter character', () => {
    const odd: Prompt[] = [
      { id: 'a-1', subject: 'a | b', text: 'body text', status: 'queued' },
    ];
    const back = parsePromptsFile(serializePrompts(odd));
    expect(back).toHaveLength(1);
    expect(back[0].text).toBe('body text');
  });

  it('is empty for an empty queue rather than producing a phantom prompt', () => {
    expect(parsePromptsFile(serializePrompts([]))).toEqual([]);
  });
});

describe('templates on disk', () => {
  it('round-trips every field, including negatives and the tuned list prompt', async () => {
    const dir = await writeTemplate(root, template);
    expect(dir).toBe(templateDir(root, 'character-sheet'));
    const back = await readTemplate(dir);
    expect(back).toEqual({ ...template, sourcePath: dir });
  });

  it('writes template.md as the plain recipe, readable outside the app', async () => {
    await writeTemplate(root, template);
    const md = await fs.readFile(join(templateDir(root, 'character-sheet'), 'template.md'), 'utf8');
    expect(md).toBe(template.body);
  });

  it('reads a hand-made template folder with no template.json', async () => {
    const dir = templateDir(root, 'storyboard');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'template.md'), 'shot by shot');
    const back = await readTemplate(dir);
    expect(back?.id).toBe('storyboard');
    expect(back?.body).toBe('shot by shot');
    // `lines` is the fallback — it is what every import did before templates.
    expect(back?.importFormat).toBe('lines');
  });

  it('keeps the .md content when template.json is unparseable', async () => {
    const dir = await writeTemplate(root, template);
    await fs.writeFile(join(dir, 'template.json'), '{ not json');
    const back = await readTemplate(dir);
    expect(back?.body).toBe(template.body);
  });

  it('is null when there is no template.md at all', async () => {
    expect(await readTemplate(templateDir(root, 'nope'))).toBeNull();
  });
});

describe('projects on disk', () => {
  it('round-trips body, queue, harvest state and the template pointer', async () => {
    const dir = await writeProject(root, record(QUEUE), 'beauty-and-joy');
    const back = await readProject(root, dir);
    expect(back?.project.name).toBe('Spring Gallery');
    expect(back?.project.body).toBe('Subject: the spring nail collection.');
    expect(back?.project.templateId).toBe('character-sheet');
    expect(back?.theme.name).toBe('spring-gallery');
    expect(back?.theme.prompts.map((p) => p.text)).toEqual(QUEUE.map((p) => p.text));
    // The harvested one comes back harvested, still pointing at its image.
    const harvested = back?.theme.prompts.filter((p) => p.status === 'harvested') ?? [];
    expect(harvested).toHaveLength(1);
    expect(harvested[0].subject).toBe('french tip');
    expect(harvested[0].savedPath).toBe('2026-08-04-1233/french-tip.png');
  });

  it('derives outputDir from the repo layout instead of committing an absolute path', async () => {
    const dir = await writeProject(root, record(QUEUE), 'b');
    const json = JSON.parse(await fs.readFile(join(dir, 'project.json'), 'utf8'));
    // An absolute path in a committed file is wrong on every other machine.
    expect(json.outputDir).toBeUndefined();
    const back = await readProject(root, dir);
    expect(back?.project.outputDir).toBe(repoRunsDir(root, 'spring-gallery'));
  });

  it('keeps an EXPLICIT outputDir override (§6 decision 6, the escape hatch)', async () => {
    const rec = record(QUEUE);
    rec.project.outputDir = '/somewhere/else';
    const dir = await writeProject(root, rec, 'b');
    const json = JSON.parse(await fs.readFile(join(dir, 'project.json'), 'utf8'));
    expect(json.outputDir).toBe('/somewhere/else');
    expect((await readProject(root, dir))?.project.outputDir).toBe('/somewhere/else');
  });

  it('records the brand the project belongs to (§3 project.json)', async () => {
    const dir = await writeProject(root, record(QUEUE), 'beauty-and-joy');
    const json = JSON.parse(await fs.readFile(join(dir, 'project.json'), 'utf8'));
    expect(json.brand).toBe('beauty-and-joy');
  });

  it('reads a hand-made project folder with only project.md', async () => {
    const dir = projectDir(root, 'hand-made');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'project.md'), 'a subject someone typed');
    const back = await readProject(root, dir);
    expect(back?.project.body).toBe('a subject someone typed');
    expect(back?.theme.prompts).toEqual([]);
  });
});

describe('readRepo — the "re-point at the repo" path', () => {
  it('reads brand, templates and projects, skipping the _template scaffolds', async () => {
    await fs.mkdir(join(root, 'brand'), { recursive: true });
    await fs.writeFile(brandDesignPath(root), 'Brand: warm daylight, soft wooden surfaces.');
    await writeTemplate(root, template);
    await writeProject(root, record(QUEUE), 'beauty-and-joy');
    await ensureScaffolds(root);

    const contents = await readRepo(root);
    expect(contents.brandBody).toBe('Brand: warm daylight, soft wooden surfaces.');
    expect(contents.brandSourcePath).toBe(brandDesignPath(root));
    // The scaffolds exist on disk but are never records.
    expect(contents.templates.map((t) => t.id)).toEqual(['character-sheet']);
    expect(contents.projects.map((p) => p.project.id)).toEqual(['spring-gallery']);
  });

  it('is empty — not an error — for a folder with nothing in it', async () => {
    const contents = await readRepo(root);
    expect(contents).toEqual({
      brandBody: null,
      brandSourcePath: null,
      templates: [],
      projects: [],
    });
  });

  it('reports no brand body when the repo carries no brand/DESIGN.md', async () => {
    await writeTemplate(root, template);
    const contents = await readRepo(root);
    expect(contents.brandBody).toBeNull();
    expect(contents.brandSourcePath).toBeNull();
  });
});

describe('ensureScaffolds (WP3)', () => {
  it('creates both _template folders', async () => {
    await ensureScaffolds(root);
    await expect(fs.access(join(templateDir(root, '_template'), 'template.md'))).resolves.toBeUndefined();
    await expect(fs.access(join(templateDir(root, '_template'), 'template.json'))).resolves.toBeUndefined();
    await expect(fs.access(join(projectDir(root, '_template'), 'project.md'))).resolves.toBeUndefined();
    await expect(fs.access(join(projectDir(root, '_template'), 'prompts.md'))).resolves.toBeUndefined();
    await expect(fs.access(join(projectDir(root, '_template'), 'project.json'))).resolves.toBeUndefined();
  });

  it('never overwrites an edited scaffold', async () => {
    await ensureScaffolds(root);
    const path = join(templateDir(root, '_template'), 'template.md');
    await fs.writeFile(path, 'David edited this');
    await ensureScaffolds(root);
    expect(await fs.readFile(path, 'utf8')).toBe('David edited this');
  });

  it('does NOT git-init the repo — that is WP5’s decision, not a side effect', async () => {
    await ensureScaffolds(root);
    await expect(fs.access(join(root, '.git'))).rejects.toThrow();
  });
});

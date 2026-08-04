import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIST_PROMPT,
  NEGATIVES_HEADING,
  compose,
  renderListPrompt,
  templateFragment,
  type Brand,
  type Project,
  type Template,
} from '../src/shared/domain';

/**
 * The three-part primer (v3 WP1) and — the load-bearing one — the back-compat
 * guarantee that an EMPTY template composes byte-identically to the two-part
 * primer every pre-v3 project has been running on.
 */

const brand: Brand = {
  id: 'beauty-joy',
  name: 'Beauty & Joy',
  body: 'Brand: Beauty & Joy — warm daylight, soft wooden surfaces.',
};

const project: Project = {
  id: 'smoothies',
  name: 'Smoothies',
  body: 'Project: Smoothies. One photorealistic product image per message.',
};

const template: Template = {
  id: 'character-sheet',
  name: 'character-sheet',
  body: 'A 5-view turnaround, 6 expressions, and a colour palette strip.',
  importFormat: 'blocks',
};

/** The EXACT pre-v3 composition, spelled out rather than imported — a test that
 *  calls the code it is guarding would drift along with it. */
function preV3Primer(b: Brand, p: Project): string {
  return [b.body.trim(), p.body.trim()].filter(Boolean).join('\n\n');
}

describe('compose — three-part primer (style → recipe → subject)', () => {
  it('orders Brand, then Template, then Project', () => {
    expect(compose(brand, template, project)).toBe(
      `${brand.body}\n\n${template.body}\n\n${project.body}`,
    );
  });

  it('composes negatives after the recipe, under a heading that reads as a rule', () => {
    const withNegatives: Template = {
      ...template,
      negatives: 'no AI-fabricated survivors, faces, or testimonials',
    };
    expect(compose(brand, withNegatives, project)).toBe(
      [
        brand.body,
        template.body,
        `${NEGATIVES_HEADING}\nno AI-fabricated survivors, faces, or testimonials`,
        project.body,
      ].join('\n\n'),
    );
  });

  it('carries negatives even when the recipe body is empty', () => {
    // Challenge DV's constraint must survive a template that is nothing BUT
    // constraints — negatives is a field, not a decoration on the body.
    const only: Template = { ...template, body: '', negatives: 'no faces' };
    expect(compose(brand, only, project)).toBe(
      [brand.body, `${NEGATIVES_HEADING}\nno faces`, project.body].join('\n\n'),
    );
  });

  it('trims each layer, so ragged file endings never leak into the primer', () => {
    expect(
      compose(
        { ...brand, body: `\n${brand.body}\n\n` },
        { ...template, body: `  ${template.body}  ` },
        { ...project, body: `${project.body}\n` },
      ),
    ).toBe(compose(brand, template, project));
  });
});

describe('compose — BACK-COMPAT: an empty Template changes nothing', () => {
  const empty: Template = { id: 'e', name: 'empty', body: '', importFormat: 'lines' };

  // The v3 → v4 migration points no project at a template, so `null` is the
  // shape every migrated project actually composes with.
  it('is byte-identical with a NULL template (the migrated state)', () => {
    expect(compose(brand, null, project)).toBe(preV3Primer(brand, project));
  });

  it('is byte-identical with an UNDEFINED template', () => {
    expect(compose(brand, undefined, project)).toBe(preV3Primer(brand, project));
  });

  it('is byte-identical with an EMPTY template record', () => {
    expect(compose(brand, empty, project)).toBe(preV3Primer(brand, project));
  });

  it('is byte-identical with a whitespace-only template body and blank negatives', () => {
    const blank: Template = { ...empty, body: '   \n\n\t ', negatives: '  \n ' };
    expect(compose(brand, blank, project)).toBe(preV3Primer(brand, project));
  });

  it('holds for every shape of existing project, including empty bodies', () => {
    // Across the full matrix of pre-v3 states — an empty brand body, an empty
    // project body, both — the empty template must remain invisible.
    const bodies = ['', '   ', 'some text', 'multi\nline\ntext'];
    for (const b of bodies) {
      for (const p of bodies) {
        const bb = { ...brand, body: b };
        const pp = { ...project, body: p };
        const expected = preV3Primer(bb, pp);
        expect(compose(bb, null, pp)).toBe(expected);
        expect(compose(bb, empty, pp)).toBe(expected);
      }
    }
  });

  it('produces the seed project’s primer unchanged', () => {
    // The literal seeded primer text — if this ever shifts, every fresh install
    // starts posting something different from every migrated one.
    const seedBrand: Brand = {
      id: 'beauty-joy',
      name: 'Beauty & Joy',
      body: 'Brand: Beauty & Joy — bright, natural, wholesome. Warm daylight, soft wooden surfaces, fresh and clean.',
    };
    const seedProject: Project = {
      id: 'smoothies',
      name: 'Smoothies',
      body: 'Project: Smoothies. For EACH message I send (a single fruit or ingredient name), generate ONE photorealistic product image of that fruit as a fresh smoothie or whole fruit, in the Beauty & Joy style — warm natural light, soft wooden background, no text and no words. Reply with only the image.',
    };
    expect(compose(seedBrand, null, seedProject)).toBe(
      `${seedBrand.body}\n\n${seedProject.body}`,
    );
  });
});

describe('templateFragment', () => {
  it('is empty for null, undefined and an empty record', () => {
    expect(templateFragment(null)).toBe('');
    expect(templateFragment(undefined)).toBe('');
    expect(templateFragment({ id: 'e', name: 'e', body: '', importFormat: 'lines' })).toBe('');
  });
});

describe('renderListPrompt', () => {
  it('falls back to the built-in ask, preserving the exact pre-v3 wording', () => {
    expect(renderListPrompt(12, 'Australian animals')).toBe(
      'Give me a list of 12 Australian animals. Names only, one per line, in a code block, no commentary.',
    );
    expect(DEFAULT_LIST_PROMPT).toContain('{count}');
    expect(DEFAULT_LIST_PROMPT).toContain('{subject}');
  });

  it('uses a template’s tuned ask, substituting every occurrence of each token', () => {
    expect(
      renderListPrompt(6, 'scenes', 'List {count} {subject}. Exactly {count}, one per line.'),
    ).toBe('List 6 scenes. Exactly 6, one per line.');
  });

  it('treats a blank tuned ask as absent', () => {
    expect(renderListPrompt(3, 'x', '   ')).toBe(renderListPrompt(3, 'x'));
  });
});

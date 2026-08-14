import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIST_PROMPT,
  NEGATIVES_HEADING,
  compose,
  renderListPrompt,
  renderPrompt,
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

describe('compose — a NULL brand drops the LOOK layer and nothing else', () => {
  /** The exact two-part composition a brand-less project must produce. */
  function templateAndProject(t: Template, p: Project): string {
    return [t.body.trim(), p.body.trim()].filter(Boolean).join('\n\n');
  }

  it('is byte-identical to Template + Project', () => {
    expect(compose(null, template, project)).toBe(templateAndProject(template, project));
  });

  it('is byte-identical with an UNDEFINED brand', () => {
    expect(compose(undefined, template, project)).toBe(templateAndProject(template, project));
  });

  it('is byte-identical with an EMPTY brand record — same mechanism, not a special case', () => {
    const empty: Brand = { id: 'e', name: 'empty', body: '' };
    expect(compose(empty, template, project)).toBe(templateAndProject(template, project));
    expect(compose({ ...empty, body: '  \n\t ' }, template, project)).toBe(
      templateAndProject(template, project),
    );
  });

  it('still carries the template’s negatives — dropping the brand drops ONLY the brand', () => {
    // The hard constraints belong to the recipe, so losing the house style must
    // never lose them: that is the failure mode a null brand could plausibly
    // introduce, and it is exactly the one Challenge DV cannot afford.
    const withNegatives: Template = { ...template, negatives: 'no faces' };
    expect(compose(null, withNegatives, project)).toBe(
      [template.body, `${NEGATIVES_HEADING}\nno faces`, project.body].join('\n\n'),
    );
  });

  it('leaves the Project alone when BOTH brand and template are none', () => {
    // The floor of the composition: with nothing above it, the primer is the
    // subject verbatim — no stray separators from the dropped layers.
    expect(compose(null, null, project)).toBe(project.body);
  });

  it('holds across every shape of template and project body', () => {
    const bodies = ['', '   ', 'some text', 'multi\nline\ntext'];
    for (const t of bodies) {
      for (const p of bodies) {
        const tt = { ...template, body: t };
        const pp = { ...project, body: p };
        expect(compose(null, tt, pp)).toBe(templateAndProject(tt, pp));
      }
    }
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

describe('renderPrompt — the recipe wrapped around every prompt', () => {
  const p = { text: 'a woman and a cat', subject: 'woman and cat' };

  it('with NO shape, returns the prompt byte-identical', () => {
    // The back-compat guarantee. Every project that existed before this field
    // must feed exactly what it fed yesterday.
    expect(renderPrompt(undefined, p)).toBe('a woman and a cat');
    expect(renderPrompt('', p)).toBe('a woman and a cat');
    expect(renderPrompt('   \n  ', p)).toBe('a woman and a cat');
  });

  it('fills {prompt} with the queue item — David’s comic-page example', () => {
    const shape = 'A full comic page in the house style. Six panels.\nScene: {prompt}';
    expect(renderPrompt(shape, p)).toBe(
      'A full comic page in the house style. Six panels.\nScene: a woman and a cat',
    );
  });

  it('fills {subject} too, so a shape can name and describe separately', () => {
    expect(renderPrompt('Title: {subject}\nScene: {prompt}', p)).toBe(
      'Title: woman and cat\nScene: a woman and a cat',
    );
  });

  it('fills EVERY occurrence, not just the first', () => {
    expect(renderPrompt('{prompt} — again: {prompt}', p)).toBe(
      'a woman and a cat — again: a woman and a cat',
    );
  });

  it('APPENDS the prompt when the shape forgot the token — never swallows it', () => {
    // The failure this rule exists for: replace-and-return would turn a shape
    // missing `{prompt}` into a run where every image is the recipe with no
    // subject — twelve identical pictures and a manifest that asserts twelve
    // different ones. Appending is visibly odd; dropping is invisibly wrong.
    expect(renderPrompt('A full comic page. Six panels.', p)).toBe(
      'A full comic page. Six panels.\n\na woman and a cat',
    );
  });

  it('still appends when the shape has {subject} but no {prompt}', () => {
    // {subject} is a label, not the content. A shape carrying only the label
    // would otherwise lose the actual prompt.
    expect(renderPrompt('Title: {subject}', p)).toBe('Title: woman and cat\n\na woman and a cat');
  });

  it('carries a multi-line prompt through intact', () => {
    // Prompts were never meant to be simplistic — `blocks` import exists so a
    // prompt can be a paragraph. The shape must not flatten it.
    const multi = { text: 'a woman and a cat\n\nrain outside, lamplight', subject: 'woman' };
    expect(renderPrompt('Scene: {prompt}', multi)).toBe(
      'Scene: a woman and a cat\n\nrain outside, lamplight',
    );
  });
});

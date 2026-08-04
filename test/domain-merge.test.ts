import { describe, it, expect } from 'vitest';
import { mergePrompts, parsePromptList, type Prompt } from '../src/shared/domain';

const harvested = (id: string, subject: string): Prompt => ({
  id,
  subject,
  text: subject,
  status: 'harvested',
  savedPath: `${subject}.png`,
});
const queued = (id: string, subject: string): Prompt => ({
  id,
  subject,
  text: subject,
  status: 'queued',
});

describe('parsePromptList startIndex', () => {
  it('continues the id suffix from startIndex', () => {
    expect(parsePromptList('mango\nlime', 2).map((p) => p.id)).toEqual(['mango-3', 'lime-4']);
  });
});

describe('mergePrompts — add', () => {
  it('appends after the existing queue, preserving order (2 + 10 = 12)', () => {
    const existing = [queued('emu-1', 'emu'), queued('wombat-2', 'wombat')];
    const ten = Array.from({ length: 10 }, (_, i) => `animal ${i}`).join('\n');
    const out = mergePrompts(existing, ten, 'add');
    expect(out).toHaveLength(12);
    expect(out.slice(0, 2)).toEqual(existing);
    // Ids continue from the kept count — nothing collides at -1.
    expect(out[2].id).toBe('animal-0-3');
    expect(out[11].id).toBe('animal-9-12');
  });

  it('keeps harvested prompts too', () => {
    const existing = [harvested('kangaroo-1', 'kangaroo'), queued('emu-2', 'emu')];
    const out = mergePrompts(existing, 'lime', 'add');
    expect(out.map((p) => p.id)).toEqual(['kangaroo-1', 'emu-2', 'lime-3']);
    expect(out[0].status).toBe('harvested');
  });
});

describe('mergePrompts — replace', () => {
  it('drops queued items but harvested survive (run record intact)', () => {
    const existing = [
      harvested('kangaroo-1', 'kangaroo'),
      queued('emu-2', 'emu'),
      queued('wombat-3', 'wombat'),
    ];
    const ten = Array.from({ length: 10 }, (_, i) => `animal ${i}`).join('\n');
    const out = mergePrompts(existing, ten, 'replace');
    expect(out).toHaveLength(11); // 1 harvested + 10 new
    expect(out[0]).toEqual(existing[0]);
    expect(out.filter((p) => p.status === 'queued')).toHaveLength(10);
    expect(out.some((p) => p.subject === 'emu')).toBe(false);
  });

  it('bumps an id that would collide with a kept harvested prompt', () => {
    // Kept harvested "mango-2"; new import's first line is mango with kept.length
    // = 1 → would also be mango-2. It must bump, not collide.
    const existing = [harvested('mango-2', 'mango'), queued('lime-3', 'lime')];
    const out = mergePrompts(existing, 'mango\nmango', 'replace');
    const ids = out.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('mango-2');
    expect(ids[1]).toBe('mango-3');
    expect(ids[2]).toBe('mango-4');
  });

  it('is deterministic — same input, same ids', () => {
    const existing = [harvested('kangaroo-1', 'kangaroo')];
    const a = mergePrompts(existing, 'emu\nwombat', 'replace');
    const b = mergePrompts(existing, 'emu\nwombat', 'replace');
    expect(a).toEqual(b);
  });
});

/**
 * Clear is a distinct mode, not "replace with an empty list". Replace is
 * disabled when the draft parses to zero items, so before this there was no
 * path to an empty queue at all.
 */
describe('mergePrompts — clear', () => {
  it('empties the queue but keeps every harvested prompt', () => {
    const existing: Prompt[] = [
      { id: 'a-1', subject: 'a', text: 'a', status: 'harvested', savedPath: 'r/a.png' },
      { id: 'b-2', subject: 'b', text: 'b', status: 'queued' },
      { id: 'c-3', subject: 'c', text: 'c', status: 'queued' },
    ];
    const out = mergePrompts(existing, '', 'clear');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a-1');
    expect(out[0].status).toBe('harvested');
  });

  it('ignores the draft entirely — clear is not an import', () => {
    const existing: Prompt[] = [{ id: 'b-1', subject: 'b', text: 'b', status: 'queued' }];
    expect(mergePrompts(existing, 'kangaroo\nkoala', 'clear')).toEqual([]);
  });

  it('is a no-op on an already-empty queue', () => {
    expect(mergePrompts([], '', 'clear')).toEqual([]);
  });
});

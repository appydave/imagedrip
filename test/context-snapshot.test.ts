import { describe, it, expect } from 'vitest';
import type { DomainState } from '../src/shared/domain';
import { buildContext, CONTEXT_TTL_MS, STALE_HINT } from '../src/main/context-snapshot';

/**
 * `context.get` (v4 §9.3). Two behaviours are the whole point of the handler,
 * and both are easy to lose in a refactor: it EXPIRES, and a stale read is an
 * ANSWER rather than an error. Without the first, an agent targets whatever was
 * last clicked before lunch; without the second, it retries a situation only a
 * human can resolve.
 */

const DOMAIN: DomainState = {
  brand: { id: 'beauty-and-joy', name: 'Beauty & Joy', body: 'warm daylight' },
  template: { id: 'nail-tile', name: 'Catalogue tile', body: 'one nail per tile', importFormat: 'lines' },
  project: {
    id: 'spring-nails',
    name: 'Spring nails',
    body: 'spring nail art',
    outputDir: '/tmp/spring',
  },
  theme: {
    name: 'spring',
    prompts: [
      { id: 'a-1', subject: 'a', text: 'a', status: 'harvested' },
      { id: 'b-2', subject: 'b', text: 'b', status: 'queued' },
      { id: 'c-3', subject: 'c', text: 'c', status: 'queued' },
    ],
  },
  activeBrandId: 'beauty-and-joy',
  brands: [{ id: 'beauty-and-joy', name: 'Beauty & Joy' }],
  activeTemplateId: 'nail-tile',
  templates: [{ id: 'nail-tile', name: 'Catalogue tile' }],
  activeProjectId: 'spring-nails',
  projects: [{ id: 'spring-nails', name: 'Spring nails' }],
};

const NOW = 1_800_000_000_000;

describe('buildContext — fresh', () => {
  const ctx = buildContext({
    now: NOW,
    lastInteractionAt: NOW - 1000,
    domain: DOMAIN,
    mode: 'dial-in',
    runPhase: 'feeding',
  });

  it('reports what the app is pointed at', () => {
    expect(ctx.active).toBe(true);
    if (!ctx.active) throw new Error('unreachable');
    expect(ctx.brand).toEqual({ id: 'beauty-and-joy', name: 'Beauty & Joy' });
    expect(ctx.template).toEqual({ id: 'nail-tile', name: 'Catalogue tile' });
    expect(ctx.project).toEqual({
      id: 'spring-nails',
      name: 'Spring nails',
      outputDir: '/tmp/spring',
    });
    expect(ctx.mode).toBe('dial-in');
  });

  it('counts the queue from the domain, not from the run status', () => {
    if (!ctx.active) throw new Error('unreachable');
    expect(ctx.run).toEqual({ status: 'feeding', queued: 2, harvested: 1 });
  });

  it('publishes when it stops being trustworthy', () => {
    if (!ctx.active) throw new Error('unreachable');
    expect(Date.parse(ctx.expiresAt)).toBe(NOW - 1000 + CONTEXT_TTL_MS);
  });
});

describe('buildContext — degradation', () => {
  it('goes stale ~5 minutes after the last human interaction', () => {
    const ctx = buildContext({
      now: NOW,
      lastInteractionAt: NOW - CONTEXT_TTL_MS - 1,
      domain: DOMAIN,
      mode: 'dial-in',
      runPhase: null,
    });
    expect(ctx).toEqual({ active: false, hint: STALE_HINT });
  });

  it('is stale, not fresh, when nobody has touched the window since launch', () => {
    const ctx = buildContext({
      now: NOW,
      lastInteractionAt: 0,
      domain: DOMAIN,
      mode: 'dial-in',
      runPhase: null,
    });
    expect(ctx.active).toBe(false);
  });

  it('gives a hint that tells the agent what the HUMAN must do', () => {
    const ctx = buildContext({
      now: NOW,
      lastInteractionAt: 0,
      domain: DOMAIN,
      mode: 'dial-in',
      runPhase: null,
    });
    if (ctx.active) throw new Error('unreachable');
    expect(ctx.hint.length).toBeGreaterThan(0);
    expect(ctx.hint).toMatch(/ImageDrip/);
  });

  it('never throws — staleness is an answer, not an error', () => {
    expect(() =>
      buildContext({
        now: NOW,
        lastInteractionAt: 0,
        // A half-built domain must still degrade rather than blow up.
        domain: { ...DOMAIN, theme: undefined as unknown as DomainState['theme'] },
        mode: 'automation',
        runPhase: null,
      }),
    ).not.toThrow();
  });
});

describe('buildContext — run and template absence', () => {
  it('reports run: null before any run this launch', () => {
    const ctx = buildContext({
      now: NOW,
      lastInteractionAt: NOW,
      domain: DOMAIN,
      mode: 'dial-in',
      runPhase: null,
    });
    if (!ctx.active) throw new Error('unreachable');
    expect(ctx.run).toBeNull();
  });

  it('reports template: null for a project on no template', () => {
    const ctx = buildContext({
      now: NOW,
      lastInteractionAt: NOW,
      domain: { ...DOMAIN, template: null },
      mode: 'automation',
      runPhase: null,
    });
    if (!ctx.active) throw new Error('unreachable');
    expect(ctx.template).toBeNull();
    expect(ctx.mode).toBe('automation');
  });

  it('reports outputDir: null rather than omitting it', () => {
    const ctx = buildContext({
      now: NOW,
      lastInteractionAt: NOW,
      domain: { ...DOMAIN, project: { ...DOMAIN.project, outputDir: undefined } },
      mode: 'dial-in',
      runPhase: null,
    });
    if (!ctx.active) throw new Error('unreachable');
    expect(ctx.project.outputDir).toBeNull();
  });
});

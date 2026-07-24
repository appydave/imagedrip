import { join } from 'node:path';
import { app } from 'electron';
import { createStore, type Store } from '@appydave/core';
import {
  compose,
  parsePromptList,
  type DomainState,
  type Prompt,
} from '../shared/domain.js';

/**
 * DomainStore — the local-first persistence behind the cockpit (§ v1 build order 1).
 * Wraps `@appydave/core` Store over one `domain.json` under userData. Holds the
 * layered model (Brand 🔒 / Project ✎ / Theme queue) and survives restarts.
 *
 * Step 1–2 scope: the human-path surface only (import a list, edit + save Project,
 * compose the primer). Feeding ChatGPT / harvesting is the run wiring (step 3) — this
 * module is deliberately provider-agnostic and touches no network.
 */

// Seeded to the chosen design's example (Beauty & Joy · Smoothies) so the shell shows
// a real, honest layout on first run. The queue is placeholder until you import; the
// HARVESTED grid starts EMPTY — nothing is harvested until a run actually harvests it.
const SEED_QUEUE = [
  'avocado',
  'banana',
  'mango',
  'lime',
  'blueberry',
  'coconut',
  'pineapple',
  'dragonfruit',
].join('\n');

// Seed primer (demo — replace with your real Brand/Project). Because the queue is
// bare words, the primer is what turns each one into an IMAGE request; without it
// ChatGPT would just chat. This is the layered model in action (primer once, short
// prompts inherit) and makes the out-of-box Run actually generate images.
const DEFAULTS: DomainState = {
  brand: {
    name: 'Beauty & Joy',
    body: 'Brand: Beauty & Joy — bright, natural, wholesome. Warm daylight, soft wooden surfaces, fresh and clean.',
  },
  project: {
    name: 'Smoothies',
    body: [
      'Project: Smoothies. For EACH message I send (a single fruit or ingredient name),',
      'generate ONE photorealistic product image of that fruit as a fresh smoothie or whole fruit,',
      'in the Beauty & Joy style — warm natural light, soft wooden background, no text and no words.',
      'Reply with only the image.',
    ].join(' '),
  },
  theme: { name: 'smoothies', prompts: parsePromptList(SEED_QUEUE) },
};

let store: Store<DomainState> | null = null;

function domain(): Store<DomainState> {
  store ??= createStore<DomainState>({
    path: join(app.getPath('userData'), 'domain.json'),
    defaults: DEFAULTS,
  });
  return store;
}

/** Read the whole domain document. */
export function getDomain(): Promise<DomainState> {
  return domain().read();
}

/** Replace the theme queue from a pasted/imported prompt list. Harvested items are
 *  dropped — a fresh import defines a fresh run. Returns the new state. */
export async function importPrompts(text: string): Promise<DomainState> {
  const prompts: Prompt[] = parsePromptList(text);
  return domain().update((s) => ({ ...s, theme: { ...s.theme, prompts } }));
}

/** Persist an edit to Project.md (the only text ImageDrip edits). Copy-BACK to the
 *  project source path is a dial-in action wired later. Returns the new state. */
export async function saveProject(body: string): Promise<DomainState> {
  return domain().update((s) => ({ ...s, project: { ...s.project, body } }));
}

/** The primer = compose(Brand, Project) — posted ONCE per conversation. */
export async function composePrimer(): Promise<string> {
  const s = await domain().read();
  return compose(s.brand, s.project);
}

/** The theme prompts, in order — the run queue snapshot source. */
export async function getQueue(): Promise<Prompt[]> {
  return (await domain().read()).theme.prompts;
}

/** Re-queue every prompt (clear harvested status) so a theme can be run again. */
export async function resetRun(): Promise<DomainState> {
  return domain().update((s) => ({
    ...s,
    theme: {
      ...s.theme,
      prompts: s.theme.prompts.map((p) => ({
        ...p,
        status: 'queued' as const,
        savedPath: undefined,
      })),
    },
  }));
}

/** Mark one prompt harvested + record where FileAuthor routed it. Returns new state. */
export async function markHarvested(promptId: string, savedPath: string): Promise<DomainState> {
  return domain().update((s) => ({
    ...s,
    theme: {
      ...s.theme,
      prompts: s.theme.prompts.map((p) =>
        p.id === promptId ? { ...p, status: 'harvested', savedPath } : p,
      ),
    },
  }));
}

import { describe, it, expect } from 'vitest';
import {
  CapabilityRefusal,
  createCapabilityGuard,
  type Principal,
} from '../src/main/capability-guard';
import type { EngineReadiness } from '../src/main/engine-readiness';

/**
 * Authorization, beneath every adapter.
 *
 * Until 2026-08-11 these checks lived inside `control-surface.ts`, which meant
 * they protected exactly one caller. The renderer — the caller with a real
 * human behind it — met none of them. This file pins the two halves that fix
 * costs: **the same gate for every principal**, and **different answers per
 * principal**, declared once instead of re-implemented per adapter.
 *
 * The test that matters most is `the human path is no longer a bypass`. That
 * one describes a live defect, not a latent one.
 */

const HUMAN: Principal = { kind: 'human' };
const PANE: Principal = { kind: 'pane-agent' };
const API: Principal = { kind: 'api-agent' };

const SIGNED_OUT: EngineReadiness = {
  ready: false,
  state: 'signed-out',
  hint: 'Sign in to ChatGPT in the right-hand pane.',
};
const READY: EngineReadiness = { ready: true, state: 'ready' } as EngineReadiness;

function guardWith(opts: {
  engine?: EngineReadiness;
  confirm?: boolean | 'throw';
  onAsk?: (verb: string) => void;
} = {}) {
  return createCapabilityGuard({
    engineReadiness: opts.engine ? async () => opts.engine as EngineReadiness : undefined,
    confirmGated:
      opts.confirm === undefined
        ? undefined
        : async (call) => {
            opts.onAsk?.(call.verb);
            if (opts.confirm === 'throw') throw new Error('the renderer blew up');
            return opts.confirm as boolean;
          },
  });
}

/** Every call the guard sees carries its channel, verb and principal. */
function call(channel: string, verb: string | null, principal: Principal, input: unknown = {}) {
  return { channel, verb, input, principal };
}

async function refusalOf(p: Promise<void>): Promise<CapabilityRefusal> {
  try {
    await p;
  } catch (err) {
    if (err instanceof CapabilityRefusal) return err;
    throw err;
  }
  throw new Error('expected a CapabilityRefusal, got none');
}

describe('the human path is no longer a bypass', () => {
  it('applies the engine precondition to a HUMAN, not just to an agent', async () => {
    // THE regression this refactor exists for. Clicking `▶ Run theme…` against
    // a signed-out ChatGPT used to reach the runner untouched, and failed
    // downstream inside `feed` — which pastes into whatever holds focus, which
    // on a signed-out page is the login form.
    const guard = guardWith({ engine: SIGNED_OUT });
    const refusal = await refusalOf(
      guard.authorize(call('imagedrip:run:start', 'run.start', HUMAN)),
    );

    expect(refusal.code).toBe('engine_not_ready');
    expect(refusal.status).toBe(409);
    expect(refusal.message).toMatch(/Sign in to ChatGPT/);
  });

  it('gives the human and the agent the SAME hint for the same problem', async () => {
    const guard = guardWith({ engine: SIGNED_OUT });
    const asHuman = await refusalOf(guard.authorize(call('imagedrip:run:start', 'run.start', HUMAN)));
    const asAgent = await refusalOf(guard.authorize(call('imagedrip:run:start', 'run.start', API)));
    expect(asHuman.message).toBe(asAgent.message);
  });

  it('lets a human through once the engine is ready', async () => {
    const guard = guardWith({ engine: READY });
    await expect(
      guard.authorize(call('imagedrip:run:start', 'run.start', HUMAN)),
    ).resolves.toBeUndefined();
  });
});

describe('what stays principal-dependent, and why', () => {
  it('never asks a HUMAN to confirm their own click', async () => {
    // A person clicking `▶ Run theme…` HAS confirmed. A second dialog is a
    // control to learn, which the North Star rules out.
    const asked: string[] = [];
    const guard = guardWith({ engine: READY, confirm: true, onAsk: (v) => asked.push(v) });

    await guard.authorize(call('imagedrip:run:stop', 'run.stop', HUMAN));
    expect(asked).toEqual([]);
  });

  it('holds the same verb for the PANE agent', async () => {
    const asked: string[] = [];
    const guard = guardWith({ confirm: true, onAsk: (v) => asked.push(v) });

    await guard.authorize(call('imagedrip:run:stop', 'run.stop', PANE));
    expect(asked).toEqual(['run.stop']);
  });

  it('does NOT hold it for any other agent — this is what keeps chat:probe headless', async () => {
    const asked: string[] = [];
    const guard = guardWith({ confirm: true, onAsk: (v) => asked.push(v) });

    await guard.authorize(call('imagedrip:run:stop', 'run.stop', API));
    expect(asked).toEqual([]);
  });

  it('lets a HUMAN drive the webview — that is what Dial-in IS', async () => {
    // `NEVER_EXPOSED` is about who may reach a capability from OUTSIDE the
    // window, not about whether the capability is safe.
    const guard = guardWith({});
    await expect(
      guard.authorize(call('imagedrip:harness:feed', 'harness.feed', HUMAN, 'a prompt')),
    ).resolves.toBeUndefined();
  });

  it('refuses the same call from an agent, as an unknown verb', async () => {
    const guard = guardWith({});
    const refusal = await refusalOf(
      guard.authorize(call('imagedrip:harness:feed', 'harness.feed', API, 'a prompt')),
    );
    // 404, not 403: an unpublished channel is INVISIBLE rather than forbidden.
    // A distinct code would advertise that `harness.feed` exists.
    expect(refusal.code).toBe('not_exposed');
    expect(refusal.status).toBe(404);
  });

  it('refuses the pickers to an agent now that they are unpublished', async () => {
    const guard = guardWith({});
    for (const [channel, verb] of [
      ['imagedrip:project:choose-output-dir', 'project.choose-output-dir'],
      ['imagedrip:repo:choose-root', 'repo.choose-root'],
    ] as const) {
      const refusal = await refusalOf(guard.authorize(call(channel, verb, API)));
      expect(refusal.code).toBe('not_exposed');
    }
  });

  it('still lets a HUMAN open a picker — it is a UI affordance, not a capability', async () => {
    const guard = guardWith({});
    await expect(
      guard.authorize(call('imagedrip:repo:choose-root', 'repo.choose-root', HUMAN)),
    ).resolves.toBeUndefined();
  });

  it('denies repo.attach to the PANE outright, without asking anybody', async () => {
    const asked: string[] = [];
    const guard = guardWith({ confirm: true, onAsk: (v) => asked.push(v) });

    const refusal = await refusalOf(
      guard.authorize(call('imagedrip:repo:attach', 'repo.attach', PANE, '/tmp/repo')),
    );
    expect(refusal.code).toBe('forbidden_for_pane');
    // Its defect cannot be described honestly in a yes/no dialog, so a yes
    // would not be informed consent. Never raise the question.
    expect(asked).toEqual([]);
  });

  it('leaves repo.attach reachable for other clients', async () => {
    const guard = guardWith({});
    await expect(
      guard.authorize(call('imagedrip:repo:attach', 'repo.attach', API, '/tmp/repo')),
    ).resolves.toBeUndefined();
  });
});

describe('fail closed', () => {
  it('refuses an engine-requiring verb when no probe is wired at all', async () => {
    // An unchecked engine and a broken one are indistinguishable from here,
    // and only one of those two guesses types into a login form.
    const guard = guardWith({});
    const refusal = await refusalOf(guard.authorize(call('imagedrip:run:start', 'run.start', API)));
    expect(refusal.code).toBe('engine_not_ready');
    expect(refusal.message).toMatch(/could not be checked/i);
  });

  it('denies when the confirm channel throws', async () => {
    const guard = guardWith({ confirm: 'throw' });
    const refusal = await refusalOf(guard.authorize(call('imagedrip:run:stop', 'run.stop', PANE)));
    expect(refusal.code).toBe('confirm_denied');
  });

  it('denies when there is no confirm channel — absent consent is not consent', async () => {
    const guard = guardWith({});
    const refusal = await refusalOf(guard.authorize(call('imagedrip:run:stop', 'run.stop', PANE)));
    expect(refusal.code).toBe('confirm_denied');
  });

  it('checks the engine BEFORE troubling a human', async () => {
    // Never spend someone's attention approving a call that cannot succeed.
    const asked: string[] = [];
    const guard = guardWith({ engine: SIGNED_OUT, confirm: true, onAsk: (v) => asked.push(v) });

    const refusal = await refusalOf(
      guard.authorize(call('imagedrip:run:start', 'run.start', PANE)),
    );
    expect(refusal.code).toBe('engine_not_ready');
    expect(asked).toEqual([]);
  });
});

describe('capabilities with no policy', () => {
  it('lets ungated verbs through for every principal', async () => {
    const guard = guardWith({});
    for (const principal of [HUMAN, PANE, API]) {
      await expect(
        guard.authorize(call('imagedrip:domain:get', 'domain.get', principal)),
      ).resolves.toBeUndefined();
    }
  });

  it('ignores scaffold channels outside the namespace', async () => {
    const guard = guardWith({});
    await expect(guard.authorize(call('app:info', null, HUMAN))).resolves.toBeUndefined();
  });
});

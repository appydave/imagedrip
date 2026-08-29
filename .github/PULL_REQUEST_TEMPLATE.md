<!--
  Adapted from ~/dev/ad/brains/agent-first-architecture/
    capability-model.md §6  — reachability
    agent-safety.md      §8  — safety

  Why this file exists: one-API-N-clients is not sustained by architecture.
  The fastest path to shipping is always to wire a feature straight into the
  renderer, and every such shortcut is invisible until someone tries to drive
  the app from outside and finds the capability isn't there.

  ImageDrip's shape makes the reachability half CHEAPER than in the reference
  implementation. The control surface mirrors the live IPC registry and the MCP
  proxy derives its whole tool list from `GET /v1/verbs` — so exposing a verb
  gives you the HTTP route AND the MCP tool for free. There is no third
  surface to hand-write and forget. What you still have to do deliberately is
  DECIDE the exposure, and check the capability physically CAN run headlessly.
-->

## What changed

<!-- One or two lines. The reasoning belongs in the commit body. -->

---

### Surface area — reachability

Skip only if this PR adds no capability (docs, refactor with no new verb, test-only).

- [ ] Capability defined — typed input, typed output, and the metadata block
- [ ] Reachable from the UI, **or** deliberately verb-only (say which, and why)
- [ ] Reachable headlessly — exposed on the control surface, or deliberately in `NEVER_EXPOSED` (say which, and why)
- [ ] **Physical-location check: this capability can actually succeed with no window and no human at the screen** — see below
- [ ] Exposure policy updated in `src/main/verb-policy.ts` and covered by `test/verb-policy.test.ts`
- [ ] All of the above land in **THIS** PR

If a box is unticked, say why here. **"Later" is not a reason.**

> **The physical-location rule, and the reason this line exists.**
> A checklist proves the verb exists. It does not prove the verb *works*.
> Anything whose logic lives in the renderer, or that needs a native dialog, or
> that needs a human looking at the screen, is **not externally reachable no
> matter what the catalog says**.
>
> **The precedent, already settled.** `project.choose-output-dir` and
> `repo.choose-root` both call `dialog.showOpenDialog` and cannot succeed
> headlessly. They were once catalogued with honest descriptions saying so, and
> that was the wrong resolution: **a verb list is a promise, and a promise with
> a footnote saying it cannot be kept is still a broken promise.** Both are now
> in `NEVER_EXPOSED` (`src/main/verb-policy.ts:176-177`) — the rule is not
> "warn about it", it is **"do not catalogue it."** Do not add a third.
>
> Nothing was lost by unpublishing them: the capability an agent actually wants
> is *set the output folder to this path*, which is `domain.save-project` with
> an `outputDir`. The picker is a UI affordance for **obtaining** a path, not a
> capability.
>
> The legitimate exception is a capability that needs the live ChatGPT view
> (`run.*`). That is inherent, not a defect — declare it in
> `ENGINE_REQUIRED_VERBS` so it is refused with a hint rather than failing
> downstream.

---

### Safety review

Fires on any PR that **adds** a capability or **newly exposes** an existing one.

- [ ] Classified — `read-only` / `reversible-write` / `destructive` / `external-side-effect`
- [ ] Authorization enforced in the capability layer — **NOT** in `control-surface.ts`, **NOT** in an MCP wrapper, **NOT** in a tool description
- [ ] Agent principal is narrower than the human's rights (scope, time, resource)
- [ ] Destructive or external-side-effect: a preview / dry-run exists **and can be answered in advance** (prefill, not `--yes`)
- [ ] Meaningful effect: accepts an idempotency key and returns the **original** result on retry
- [ ] Mutation returns its **previous value**
- [ ] Audit record carries principal, parameters and prior state
- [ ] Failure modes enumerated and distinguishable

Unticked boxes need a reason. **"The agent won't do that" is not one.**

> **The test for the authorization line:** if `scripts/imagedrip-mcp.mjs` were
> deleted tomorrow, is this capability still protected? If yes, good — that
> proxy holds no logic by design. Now ask the harder one: **if
> `control-surface.ts` were deleted tomorrow, is it still protected?**
>
> **Today the answer is yes, and it must stay yes.** The engine gate, the D1
> human gate and `PANE_DENIED_VERBS` all live in `src/main/capability-guard.ts`,
> beneath every adapter — moved there on 2026-08-11 (`3f274d3`) from
> `control-surface.ts`, where they were sound only while exactly one non-UI
> adapter existed. `control-surface.ts:273` now says `── Authorization — NOT
> here ──`, and both the renderer and the HTTP surface call
> `authorize(principal, capability, input)` on the way in.
>
> So the check on your PR is a regression check: **if it adds a check, does the
> check sit in `capability-guard.ts`?** A check added to `control-surface.ts`,
> to the MCP proxy, or to a tool description re-creates the exact shape that was
> deleted, and it breaks silently at the second adapter.

---

### The two rules this repo does not bend

- [ ] Nothing in this PR writes to the ChatGPT webview by any path other than the CadenceEngine
- [ ] Nothing in this PR weakens `NEVER_EXPOSED`

---

### Verification

- [ ] `npm test` green
- [ ] `npm run typecheck` green
- [ ] `npm run chat:probe` green — **13/13**, against a running app
- [ ] Runtime behaviour observed **in the app**, not inferred from a passing suite

> The last box is not ceremony. Three defects in this repo were invisible to a
> fully green suite and only appeared when the app was run: the truncated
> capability probe, the dropped `result` frame, and the run that stayed "live"
> after it finished. See `docs/kdd/learnings/`.

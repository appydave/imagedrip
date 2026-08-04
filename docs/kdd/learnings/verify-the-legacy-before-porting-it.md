---
topic: "Porting behaviour from an earlier implementation"
issue: "A remembered 'sophisticated pacing engine' turned out to be 12 lines simpler than what it was meant to improve"
created: "2026-08-04"
story_reference: "ad-hoc — cadence work block"
category: "process"
severity: "medium"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# Verify the legacy implementation before scoping a port of it

## Problem Signature

**Symptoms**: A work block was scoped around extracting a cadence model from an
earlier Ruby version of this tool — described as having "per-call padding, plus periodic
longer rests (roughly every 7–8 calls it slowed right down)", i.e. materially more
sophisticated than ImageDrip's `cadenceBaseMs + jitter`. The plan included a ticket
covering "the padding formula, the burst-and-rest schedule, any jitter distribution, and
any backoff on refusal or rate-limit".

**Environment**: Planning a port from `~/dev/historical/`.

**Triggering Conditions**: Any task phrased as "port the good thing from the old
version" where the old version is remembered rather than read.

## Root Cause

The source was found at
`~/dev/historical/ai-prompts/midjourney/scripts/mj-automation.rb` — 57 lines, and its
entire pacing model is:

```ruby
WAIT_EVERY = 7
PAUSE_FOR  = 5

sleep(PAUSE_FOR)
if (index + 1) % WAIT_EVERY == 0
  puts "Press enter to continue..."
  gets          # blocks for a human keypress
end
```

Measured against the brief: **no** padding formula, **no** jitter distribution, **no**
ramping, **no** backoff on refusal or rate-limit. Four of the five things to be extracted
did not exist. A flat 5-second sleep and a manual keypress gate — and it drove Midjourney
via the clipboard, not ChatGPT, so it wasn't even the same driver.

It was **less** capable than the system it was going to improve: ImageDrip already had
base + jitter, which is strictly ahead of a fixed sleep.

Memory had smoothed a crude script into an architecture. That is the normal failure mode
of recalled code — the *intent* is remembered accurately ("don't look mechanical") and
gets reconstructed as a mechanism that was never written.

## Solution

Locate and read the source **before** scoping work around it, and report the actual path
and contents before extracting anything. Where the brief and the code disagree, the code
wins and the plan changes.

Here the outcome was: skip the ticket, keep the one genuinely good idea (a checkpoint
every N images — human-gated rather than clock-gated, which is a real anti-rhythm device),
and design cadence from measured data instead.

No code rule — this is a process learning, and padding it with a snippet would be noise.

## Prevention

- **For Dev**: when a task says "port X from the old version", the first deliverable is
  the path and the actual code, not an implementation. Refuse to reconstruct an algorithm
  from a description of it when the source is findable — a reconstruction from memory is
  indistinguishable from invention.
- **For Review**: if a plan cites a legacy implementation, ask which file was read. "As I
  recall it did…" is not a source.
- **For Stories**: a port story should carry the source path in its acceptance criteria,
  so the discrepancy surfaces at planning rather than after the work is scoped.

## Related

- Story: ad-hoc — 2026-08-04
- Related learnings: []
- Related patterns: []

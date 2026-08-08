---
topic: "Child-process stdout truncation in Electron's main process"
issue: "A capability probe silently read half of `claude -p --help`, so a supported flag reported as unsupported and the chat refused to start"
created: "2026-08-08"
story_reference: "v4 WP4 — the in-app Context｜Chat pane, step 4"
category: "infrastructure"
severity: "high"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# A truncated probe reads as an absent flag

## Problem Signature

**Symptom**, in the app and nowhere else:

```
ContainmentUnavailableError: This Claude Code CLI cannot be contained,
so ImageDrip will not start the chat.

Missing: --verbose
```

The installed CLI (2.1.226) supports `--verbose`. It is on line 209 of its own
`--help`. Every unit test passed. `npm run chat:probe` passed 13/13. The probe
run from plain Node returned all 65 flags.

**The tell** was that exactly ONE flag was missing. A CLI that is too old lacks
a family of flags; a CLI that lacks precisely one, and that one demonstrably
present, is not a version problem — it is a reading problem.

## What was actually happening

`claude -p --help` writes ~15 KB to stdout and then exits immediately.

- A child's unflushed pipe data dies with the child.
- macOS starts a pipe at an **8 KB** buffer.
- So a parent that has not drained the pipe by the time the child exits gets a
  **fragment**, cut mid-sentence, with no error and no signal that anything is
  missing.

Measured, same machine, same binary, same moment:

| Reader | Bytes | Flags found | `--verbose` |
|---|---|---|---|
| shell (`claude -p --help \| wc -c`) | 14 965 | 65 | ✅ |
| plain Node, `execFile` | 14 961 | 65 | ✅ |
| **Electron main, `execFile`** | **8 190** | **45** | ❌ |
| **Electron main, `spawn` + stream** | **8 190** | **45** | ❌ |
| Electron main, stdout → **file descriptor** | 14 961 | 65 | ✅ |

It is not a `maxBuffer` limit (that was 4 MB) and not the reading style —
`execFile` and a streaming `spawn` truncate identically. It is that Electron's
main process, busy at startup, does not service the pipe in time. Plain Node
does, which is why it never showed up outside the app.

## Why this one is worth a file

The truncation is the mechanism. The **defect** is that it is invisible:

> A short read and a genuinely absent flag produce the same empty answer, and
> the caller believes the second one.

The refusal message named the user's CLI as the problem, with a version number
and an instruction to upgrade — confident, specific, and wrong. This is the
repo's own rule from the `feed()` fix, in a new place: *a control that quietly
disappears is worse than none, because it is believed.*

Note the one piece of luck: it failed **closed**. A missing containment flag
refuses the spawn, so the outcome was an unusable chat rather than an
uncontained agent. Nothing about the design guaranteed that direction — the
same truncation against a differently-ordered help page would have hidden a
flag we gate on rather than one we merely require.

## Resolution

`probeCapabilities()` writes the child's stdout to a **temp file** rather than a
pipe, and reads the file after the child closes. A regular file has no buffer
limit, so the read is complete and deterministic. Also added: a 15s kill so a
hung `--help` cannot hang the pane behind it.

## Prevention

- **When a child writes more than a few KB and exits on its own, do not read it
  through a pipe.** Redirect to a file, or keep the child alive until the parent
  has drained. Electron's main process is exactly the parent that will not drain
  in time.
- **Ask what a negative result cannot distinguish.** "Flag absent" had two
  causes and the code could only see one. Where a check has an
  indistinguishable failure mode, either remove the ambiguity or report the
  ambiguity — never collapse it into the confident answer.
- **A green suite is not coverage of the runtime.** Every test passed
  throughout, because vitest runs under Node and the bug needs Electron. Run it
  in the app.

## Reproducing it

The bug needs Electron; it will not reproduce under vitest, even with the
parent's event loop deliberately blocked for 400ms after the spawn. To see it
again, run this under `./node_modules/.bin/electron` and compare a piped read
with a file-descriptor read of any command that writes >8 KB and exits at once:

```js
const { app } = require('electron');
const { spawn } = require('node:child_process');
app.whenReady().then(() => {
  const child = spawn('claude', ['-p', '--help'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.on('close', () => { console.log('BYTES:', out.length); app.exit(0); });
});
```

`test/claude-probe.test.ts` pins the contract the fix must keep, and says in its
own header that it does not reproduce the bug.

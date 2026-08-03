---
topic: "Labelling artifacts in the UI"
issue: "A caption derived a filename instead of showing the real one, manufacturing four confident bug reports"
created: "2026-08-03"
story_reference: "ad-hoc — live UAT session, v2 acceptance pass"
category: "frontend"
severity: "medium"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# Render the artifact's real identity, not a derived guess

## Problem Signature

**Symptoms**: Four separate 👎 verdicts were captured against harvested images, all saying the
same thing: *"the file names generally should be lowercase dash notation."*

The files on disk were **already** `luc-moreau.png`, `henri-bellamy.png` — correct, lowercase,
dash-separated. Nothing was wrong with the naming.

**Environment**: The HARVESTED lane in the ImageDrip cockpit.

**Triggering Conditions**: Any prompt whose `subject` differs from its output filename — which
is most of them, since the subject is free text ("Luc Moreau — ") and the filename is slugified.

## Root Cause

The tile caption **reconstructed** a filename from the prompt subject instead of showing the
real one:

```tsx
{props.subject}.png        // "Luc Moreau — " → "Luc Moreau —.png"
```

Meanwhile `FileAuthor` had written `luc-moreau.png`. The label was a plausible-looking lie, and
because it looked authoritative it was believed over the filesystem.

The cost is the interesting part: a display bug **generated four confident, specific, and
entirely wrong bug reports** about a subsystem that was working correctly. A reviewer's trust in
a label is transitive — a wrong label doesn't just mislead, it manufactures work.

## Solution

Derive the label from the artifact's real path, which the app already stores.

Wrong way:

```tsx
// src/renderer/src/App.tsx
<span>{props.subject}.png</span>
```

Right way:

```tsx
// src/renderer/src/App.tsx
/** The REAL filename on disk, not the prompt subject. */
function fileNameOf(it: { subject: string; savedPath?: string }): string {
  if (!it.savedPath) return it.subject;
  return it.savedPath.slice(it.savedPath.lastIndexOf('/') + 1);
}

<span title={fileNameOf(props)} className="…">
  <span className="min-w-0 truncate">{fileNameOf(props)}</span>
</span>
```

## Prevention

- **For Dev**: when an artifact has a real identity (path, id, URL), **render that**. Never
  re-derive a display value by reapplying the same transform the writer used — the two will
  drift, and the label will be believed over the truth.
- **For Review**: for any caption that looks like a filename, id or path, ask *"is this the
  stored value, or a reconstruction?"* Reconstructions must be justified.
- **For Stories**: when a story adds a display label for a written artifact, its acceptance
  criteria should name the field the label reads from.

## Related

- Story: ad-hoc — 2026-08-03
- Related learnings: []
- Related patterns: []
- Corpus: 4 of the first 8 `ImageVerdict` records were this one display bug
  (see [[../decisions/adr-001-in-app-judgment-capture-for-acceptance]])

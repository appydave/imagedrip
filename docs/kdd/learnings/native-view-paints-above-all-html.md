---
topic: "Embedded native views and renderer z-index"
issue: "A WebContentsView composites above every HTML element, so popovers overlapping it are invisible"
created: "2026-08-03"
story_reference: "ad-hoc — live UAT session, v2 acceptance pass"
category: "frontend"
severity: "high"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# Embedded native views — a WebContentsView paints above ALL HTML

## Problem Signature

**Symptoms**: The WP5 run-entry chooser (`▶ Run theme…`) appeared to do nothing. Its top edge
was visible for a few pixels below the button, then it vanished behind the ChatGPT panel. The
Live UAT composer anchored to that same region was invisible entirely. No error, no console
warning — the button simply looked broken.

**Environment**: Electron 34 renderer, macOS. A `WebContentsView` added via
`window.contentView.addChildView(view)` and positioned over a reserved rect in the React layout.

**Triggering Conditions**: Any absolutely-positioned renderer element whose bounds overlap the
native view's rect. It cost a full round-trip to diagnose because the failure is silent and
looks like a dead click handler.

## Root Cause

A `WebContentsView` is a **native view composited over the window**, not an element in the
document. It is not in the stacking context at all, so `z-index` — at any value — cannot raise
HTML above it. The renderer's own `z-[9999]` was working perfectly and still lost.

Two secondary faults compounded it:

1. The popover was rendered inside the CONTEXT rail, which is `overflow-y-auto` — so even away
   from the native view it was clipped by an ancestor.
2. The first fix hid the view with `setVisible(false)`, but the renderer's `ResizeObserver`
   fired during the layout change and called `setBounds` — putting the view straight back on
   top mid-popover.

## Solution

**The structural fix is the real one: don't put anything that opens near the native view.**
Fighting the compositor is a losing game; the layout was rearranged so every control that can
open a menu lives outside the native view's column, and only read-only status sits above it.

Mechanically, floating UI also needs two things — portalling (escapes `overflow` clipping) and
a guarded hide (needed for full-screen modals, which necessarily cover the whole window).

Wrong way — trusting the stacking context, and hiding without guarding bounds:

```tsx
// src/renderer/src/App.tsx — invisible whenever it overlaps the panel
<div className="absolute right-0 top-full z-50 mt-1.5 …">{children}</div>
```

```ts
// src/main/webview-harness.ts — a stray setBounds un-hides it immediately
setVisible(visible: boolean): void {
  this.view?.setVisible(visible);
}
```

Right way — park the view AND refuse bounds updates while parked:

```ts
// src/main/webview-harness.ts
setBounds(bounds: Rect): void {
  this.wantedBounds = bounds;
  if (this.parked) return;          // ← the ResizeObserver race
  this.view?.setBounds(bounds);
}

setVisible(visible: boolean): void {
  const view = this.view;
  if (!view) return;
  if (visible) {
    this.parked = false;
    view.setVisible(true);
    if (this.wantedBounds) view.setBounds(this.wantedBounds);
    return;
  }
  this.parked = true;
  view.setVisible(false);
  view.setBounds({ x: -20000, y: 0, width: 1, height: 1 });   // park off-screen
}
```

```tsx
// src/renderer/src/Popover.tsx — portal out of every ancestor's overflow
return createPortal(
  <div style={{ position: 'fixed', top, left, width }} className="z-[9999] …">
    {children}
  </div>,
  document.body,
);
```

Hiding is **not** detaching — the page keeps running, the session and any in-flight generation
are untouched. Acquire/release is refcounted so nested popovers can't restore the view early.

## Prevention

- **For Dev**: treat the native view's rect as a **no-fly zone for anything that opens**. Put
  actions on one side, read-only status on the other. Reach for portals + a guarded hide only
  for the cases that genuinely must cover the window (full-screen modals).
- **For Review**: any new dropdown, tooltip, popover or menu — ask where it lands relative to
  the embedded view. `z-index` in the diff is not evidence it will be visible.
- **For Stories**: a story that adds floating UI to a window hosting a native view must state
  which side of that boundary the control sits on.

## Related

- Story: ad-hoc — live UAT round 1 and round 2, 2026-08-03
- Related learnings: [[electron-default-user-agent-is-bot-refused]]
- Related patterns: []

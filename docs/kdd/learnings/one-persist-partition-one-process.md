---
topic: "Chromium profile locking in Electron dev loops"
issue: "Two app instances sharing one persist: partition silently reset each other's storage"
created: "2026-08-03"
story_reference: "ad-hoc — live UAT session, v2 acceptance pass"
category: "infrastructure"
severity: "high"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# One `persist:` partition means one process — enforce it

## Problem Signature

**Symptoms**: Every launch logged, without fail:

```
ERROR:quota_database.cc(1059)      Could not open the quota database, resetting.
ERROR:service_worker_storage.cc    Failed to delete the database: Database IO error
```

The partition directory looked healthy otherwise — 199 MB, cookies written to the second, 6.6 MB
of Local Storage — but `IndexedDB` was implausibly small and no `QuotaManager` database existed
at all.

**Environment**: `npm run dev` (electron-vite), Electron 34, macOS, `persist:imagedrip-chatgpt`.

**Triggering Conditions**: A second app instance started while a previous one was still running.
In an agent-driven dev loop this happens constantly, because each "just relaunch it" leaves the
prior instance alive unless it is explicitly killed.

## Root Cause

A `persist:` partition is a **Chromium profile directory**, and its LevelDB stores
(`IndexedDB`, `Service Worker`, `Local Storage`, the quota database) take an **exclusive file
lock**. A second process cannot acquire those locks, so its storage subsystems fail to open and
Chromium resets them — on every start.

The errors were dismissed as "common Electron noise" for most of the session. They were not
noise; they were an accurate report of two processes fighting over one profile. The user
identified the cause from behaviour alone: *"you do start up image drips for me, but you don't
close down previous ones."*

Note this is a **separate fault** from
[[electron-default-user-agent-is-bot-refused]], which had overlapping symptoms. Both were live
at once, which is exactly why symptom-based reasoning kept producing wrong answers.

## Solution

Take a single-instance lock so a second launch cannot reach the profile at all.

```ts
// src/main/index.ts — module scope, before the app starts
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!hostWindow || hostWindow.isDestroyed()) return;
    if (hostWindow.isMinimized()) hostWindow.restore();
    hostWindow.focus();          // surface the instance that owns the profile
  });
  void desktop.start();
}
```

Verified: one instance running, **zero** storage errors on a clean launch (previously two on
every start).

## Prevention

- **For Dev**: any Electron app with a `persist:` partition should take
  `app.requestSingleInstanceLock()` as baseline wiring. In an agent-driven loop, always kill the
  previous instance before relaunching — and prefer an app that refuses the second launch over
  discipline that has to be remembered.
- **For Review**: treat repeated `quota_database` / `service_worker_storage` errors as a
  **profile contention signal**, not as background noise. Check the process count first.
- **For Stories**: "relaunch the app to verify" should mean *stop, then start* — a story's
  verification steps should say so explicitly.

## Related

- Story: ad-hoc — 2026-08-03
- Related learnings: [[electron-default-user-agent-is-bot-refused]]
- Related patterns: []

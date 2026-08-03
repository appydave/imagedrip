---
topic: "Embedding a real consumer website in Electron"
issue: "Electron's default user agent is bot-refused, so the shell loads and authenticates while every API call hangs"
created: "2026-08-03"
story_reference: "ad-hoc — live UAT session, v2 acceptance pass"
category: "ai-integration"
severity: "critical"
status: "resolved"
recurrence_count: 1
promoted_to_pattern: ""
sensitivity: normal
---

# Electron's default user agent gets XHR-refused by consumer web apps

## Problem Signature

**Symptoms**: The embedded ChatGPT panel showed a session that was unmistakably logged in — the
correct account email, the correct workspace, the app chrome fully rendered — but with **no chat
history**. Opening the account menu showed the workspace list as **grey skeleton placeholders
that never resolved**. No error was surfaced anywhere in the UI.

**Environment**: Electron 34, `WebContentsView` on a `persist:` partition, loading
`https://chatgpt.com/`.

**Triggering Conditions**: Present from the very first build; surfaced only when someone looked
for state that arrives over an API rather than in the initial HTML. It recurred across sessions
and was repeatedly misread as a caching problem.

## Root Cause

No user agent was ever set, so the view sent Electron's default:

```
Mozilla/5.0 (Macintosh; …) AppleWebKit/537.36 (KHTML, like Gecko)
  imagedrip/0.1.0 Chrome/132.0.6834.196 Electron/34.5.8 Safari/537.36
```

The `Electron/` token and the application name are enough for the site's bot protection to
**serve the static shell and honour the session cookie while refusing the `/backend-api/*`
XHRs behind it**.

This failure mode is unusually deceptive: everything that proves "I am logged in" is delivered
by the shell, so the login looks fine. Only the parts that hydrate from an API stay empty.

**The diagnostic tell**: two *different* endpoints (conversation history, workspace list) both
hanging on skeleton loaders while the page shell renders perfectly. One empty list is a data
question. Two unrelated lists hanging is a transport question — the shell is fine and the API
layer is not.

Two wrong hypotheses were burned before this one, both because symptoms were reasoned about
instead of measured: "wrong workspace" (the account genuinely was correct) and "corrupt local
storage" (a real but *separate* fault — see [[one-persist-partition-one-process]]).

## Solution

Pin a plain Chrome user agent **on the session, before the first load** — not just on the view,
so XHR/fetch, the service worker and any in-session `net.fetch` present one identity.

Wrong way — never setting it, and inheriting the Electron default:

```ts
// src/main/webview-harness.ts
const view = new WebContentsView({
  webPreferences: { partition: this.opts.partition ?? DEFAULT_PARTITION, … },
});
```

Right way:

```ts
// src/main/webview-harness.ts
const partition = this.opts.partition ?? DEFAULT_PARTITION;

// Read the Chrome major from the RUNNING Chromium so the UA stays truthful
// across Electron upgrades instead of drifting to a version that never shipped.
const chromeMajor = process.versions.chrome.split('.')[0];
const userAgent =
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
session.fromPartition(partition).setUserAgent(userAgent);

const view = new WebContentsView({ webPreferences: { partition, … } });
```

Verified on a clean launch: the log reports `Chrome/132.0.0.0 Safari/537.36` with no Electron
marker.

## Prevention

- **For Dev**: **any** Electron app embedding a real consumer website must pin a plain Chrome UA
  on the session as part of the initial wiring — before anything else is debugged. Do not
  hard-code the Chrome major; derive it from `process.versions.chrome`.
- **For Review**: if an embedded site shows "logged in but empty", check the UA **first**.
  Reject cache/storage theories until the UA has been ruled out — this cost two wrong diagnoses.
- **For Stories**: a story that embeds a third-party web app should list UA pinning alongside
  partition persistence as baseline setup, not as a bug fix later.

## Related

- Story: ad-hoc — 2026-08-03
- Related learnings: [[one-persist-partition-one-process]],
  [[native-view-paints-above-all-html]]
- Related patterns: []

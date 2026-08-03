import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RunManifest, RunSummary, Rect } from '@shared/ipc';
import { compose, type DomainState } from '@shared/domain';
import { useAppStore } from './store';
import { FlagButton, UatToggle, VerdictBar } from './FlagButton';
import { Modal, Popover } from './Popover';
import { Grabber, SizePresets, useResizable } from './useResizable';

/** Map a DOM element to the webview bounds (CSS px === DIP in Electron's content view). */
function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

export default function App(): JSX.Element {
  const {
    domain,
    status,
    ctxOpen,
    mode,
    flash,
    runs,
    runView,
    fetchChatPrimed,
    init,
    importPrompts,
    saveProject,
    copyPrimer,
    copyNextPrompt,
    resetRun,
    saveBrand,
    createBrand,
    switchBrand,
    copyText,
    createProject,
    switchProject,
    chooseOutputDir,
    openRun,
    closeRun,
    revealRun,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
    injectPrimer,
    injectPrompt,
    setCtx,
    setMode,
    uat,
  } = useAppStore();

  // macOS hides the native title bar (hiddenInset) — so the top bar must be the
  // drag handle, and it must clear the floating traffic-light buttons on the left.
  const isMac = navigator.userAgent.includes('Macintosh');

  // Both side panels are drag-resizable and remember their width. Neither was,
  // and both were too narrow to work in (live UAT 2026-08-03).
  const ctx = useResizable('imagedrip.ctxWidth', 240, { min: 200, max: 620 }, 'left');
  const gpt = useResizable('imagedrip.gptWidth', 330, { min: 280, max: 1000 }, 'right');

  // The ChatGPT column is a RESERVED placeholder — main overlays the live
  // WebContentsView at this element's rect. We never render ChatGPT ourselves.
  const gptRef = useRef<HTMLDivElement>(null);
  const attached = useRef(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Embed + bounds-sync the proven webview (build order step 2). Attach once; keep it
  // pinned to the reserved column on resize. StrictMode double-mount is safe — attach()
  // is idempotent (it re-bounds an existing view) and we never detach on cleanup.
  useLayoutEffect(() => {
    const el = gptRef.current;
    if (!el) return;
    const sync = (): void => {
      const rect = rectOf(el);
      if (rect.width === 0 || rect.height === 0) return;
      if (attached.current) void window.imagedrip.setBounds(rect);
      else {
        attached.current = true;
        void window.imagedrip.attach(rect);
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  // Layout shifts (CONTEXT open/close, mode row) can move the reserved column.
  useLayoutEffect(() => {
    const el = gptRef.current;
    if (el && attached.current) void window.imagedrip.setBounds(rectOf(el));
    // `uat` is in here because the ⚑ strip above the panel changes its rect —
    // miss it and the overlaid ChatGPT view drifts out of alignment.
  }, [ctxOpen, mode, uat]);

  // Transient copy/save confirmations self-clear.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => useAppStore.setState({ flash: null }), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const prompts = domain?.theme.prompts ?? [];
  const queued = prompts.filter((p) => p.status === 'queued');
  const harvested = prompts.filter((p) => p.status === 'harvested');

  const phase = status?.phase ?? 'idle';
  const isRunning = ['priming', 'feeding', 'awaiting', 'harvested', 'waiting'].includes(phase);
  const isPaused = phase === 'paused';
  const harvestedN = status?.harvested ?? harvested.length;
  const totalN = status && isRunning ? status.total : prompts.length;
  const avgLabel = status?.avgMs ? `${(status.avgMs / 1000).toFixed(1)}s/img` : '—s/img';
  const reprimeLabel = isRunning && status ? String(status.reprimeInImages) : '—';

  // A short live-activity string for the footer (what the run is doing right now).
  const activity =
    status?.note ??
    (phase === 'priming'
      ? 'priming a fresh chat…'
      : phase === 'feeding'
        ? `feeding: ${status?.currentSubject ?? ''}`
        : phase === 'awaiting'
          ? `awaiting image: ${status?.currentSubject ?? ''}`
          : phase === 'waiting'
            ? `next in ${Math.round((status?.nextFeedInMs ?? 0) / 1000)}s`
            : null);

  return (
    <div className="flex h-screen flex-col bg-linen font-sans text-brown">
      {/* ── top bar (also the window drag handle — hiddenInset has no native bar) ── */}
      <header
        className="flex items-center gap-3 border-b border-edge bg-surface py-2.5 pr-4 [-webkit-app-region:drag]"
        style={{ paddingLeft: isMac ? 80 : 16 }}
      >
        <span className="font-display text-lg font-bold tracking-wide">
          IMAGE<span className="text-amber">DRIP</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-edge bg-cream px-2.5 py-1 font-display text-[11px] tracking-wide text-muted">
          <span className="h-[7px] w-[7px] rounded-full bg-sage" />
          ChatGPT
        </span>
        {/* ══ ACTIONS — everything that can OPEN lives here, on the left ══
            The ChatGPT panel is a native surface painted over all HTML; no
            z-index reaches it. So the fix isn't to fight the stacking — it's to
            never open a menu above it in the first place. Round 2 of the live
            UAT put it plainly: "why would you put anything near it that needs
            to navigate this particular z-index problem, which none of them can
            navigate?" Everything right of the spacer below is READ-ONLY. */}
        <span className="[-webkit-app-region:no-drag]">
          <FlagButton
            region="topbar"
            snapshot={() =>
              `state=${isRunning ? 'LIVE' : isPaused ? 'PAUSED' : 'IDLE'} ${harvestedN}/${totalN} harvested · re-prime in ${reprimeLabel} · ${avgLabel}`
            }
          />
        </span>

        {/* The switch never said what it switched. Dial-in and Auto are two ways
            to feed the SAME queue — one at a time by hand, or all of them
            unattended (live UAT: "I'm really lost on what the dial versus auto
            buttons do… I find the whole dial, auto, and run theme confusing"). */}
        <div className="flex overflow-hidden rounded-md border border-edge font-display text-xs tracking-wide [-webkit-app-region:no-drag]">
          {(
            [
              {
                key: 'dial-in' as const,
                label: 'Dial-in',
                sub: 'one at a time',
                title:
                  'DIAL-IN — send prompts one at a time, by hand.\n\nUse it to get the look right: ⚡ Initialise project posts the primer, then ⚡ inject on any queued row sends just that one. Nothing runs on its own.',
              },
              {
                key: 'auto' as const,
                label: 'Auto',
                sub: 'whole queue',
                title:
                  'AUTO — run the whole queue unattended.\n\n▶ Run theme… starts it: feed → wait for the image → harvest → pause → next, re-priming a fresh chat every ~18 images. Use it once Dial-in has the look right.',
              },
            ]
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              title={m.title}
              className={
                'flex flex-col items-center px-3 py-1 leading-tight ' +
                (mode === m.key ? 'bg-yellow font-semibold text-brown' : 'text-muted hover:bg-linen')
              }
            >
              <span>{m.label}</span>
              <span className="font-mono text-[9px] opacity-70">{m.sub}</span>
            </button>
          ))}
        </div>

        {/* run control — phase-driven primary action (WP5): one coherent group.
            STOP exists ONLY when there is something to stop. */}
        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <FlagButton
            region="run-control"
            snapshot={() =>
              `mode=${mode} phase=${phase} harvested=${harvestedN}/${totalN} queued=${queued.length} reprimeIn=${reprimeLabel}`
            }
          />
          {isRunning ? (
            <button
              type="button"
              onClick={() => void pauseRun()}
              title="hold the run — Resume continues from the same position"
              className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-brown hover:border-amber"
            >
              ⏸ Pause
            </button>
          ) : isPaused ? (
            <button
              type="button"
              onClick={() => void resumeRun()}
              title="continue from where the run paused"
              className="rounded-md border border-sage bg-cream px-3 py-1.5 font-display text-xs font-semibold text-sage hover:brightness-95"
            >
              ▶ Resume
            </button>
          ) : mode === 'dial-in' ? (
            <button
              type="button"
              onClick={() => void injectPrimer()}
              title="posts the composed primer into the LIVE chat and submits it — no new conversation, no keyboard"
              className="rounded-md bg-amber px-3.5 py-1.5 font-display text-xs font-bold tracking-wide text-cream hover:brightness-105"
            >
              ⚡ Initialise project
            </button>
          ) : queued.length > 0 ? (
            <RunEntryButton
              fetchPrimed={fetchChatPrimed}
              chunkSize={18}
              onRun={(entry) => void startRun(entry)}
              onOpenProject={() => setCtx(true)}
            />
          ) : (
            <button
              type="button"
              onClick={() => void resetRun()}
              className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-muted hover:border-amber"
            >
              ↺ Reset
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              type="button"
              onClick={() => void stopRun()}
              title="end the run — the queue keeps its progress; the ChatGPT view and login stay attached"
              className="rounded-md border border-[#dcaea6] bg-[#f6e4e0] px-3 py-1.5 font-mono text-xs text-[#b5524a] hover:bg-[#f2d7d1]"
            >
              ■ STOP
            </button>
          )}
        </div>

        <span className="flex-1" />

        {/* ══ STATUS — read-only, and the only thing allowed to sit above the
            ChatGPT column. Nothing here opens, so nothing here can be eaten. ══
            Every number says what it counts: "4/16" gave no clue the 16 was the
            theme's prompt count (live UAT: "I don't know what the 4/6 is"). */}
        <div className="flex items-center gap-4 font-mono text-[11px] text-muted">
          <span title={`${harvestedN} images harvested out of ${totalN} prompts in this theme`}>
            <b className="font-display text-base text-brown">{harvestedN}</b>
            <span className="text-muted">/{totalN}</span> images done
          </span>
          <span title="images left in this conversation before a fresh chat + re-posted primer">
            re-prime in <b className="text-amber">{reprimeLabel}</b>
          </span>
          <span title="rolling average generation time per image">{avgLabel}</span>
        </div>

        <span
          className={
            'rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest ' +
            (isRunning
              ? 'border-sage bg-cream text-sage'
              : isPaused
                ? 'border-amber bg-cream text-amber'
                : 'border-edge bg-cream text-muted')
          }
        >
          {isRunning ? '● LIVE' : isPaused ? '⏸ PAUSED' : '○ IDLE'}
        </span>

        {/* Live UAT gate (docs/live-uat.md) — off by default, never a nag. */}
        <UatToggle />
      </header>

      {/* ── body ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {ctxOpen ? (
          <>
          <ContextPanel
            width={ctx.width}
            domain={domain}
            isRunning={isRunning}
            runs={runs}
            onClose={() => setCtx(false)}
            onSaveProject={saveProject}
            onSaveBrand={saveBrand}
            onCreateBrand={(name) => void createBrand(name)}
            onSwitchBrand={(id) => void switchBrand(id)}
            onCopyPrimer={() => void copyPrimer()}
            onCopyPrompt={() => void copyNextPrompt()}
            onCopyText={(text, label) => void copyText(text, label)}
            onSwitchProject={(id) => void switchProject(id)}
            onCreateProject={(name, dir) => void createProject(name, dir)}
            onChooseDir={chooseOutputDir}
            onOpenRun={(id) => void openRun(id)}
          />
          <Grabber onMouseDown={ctx.onGrabberDown} dragging={ctx.dragging} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setCtx(true)}
            className="flex w-[46px] flex-shrink-0 items-center justify-center border-r border-edge bg-surface hover:bg-linen"
          >
            <span className="font-mono text-[11px] tracking-widest text-muted [writing-mode:vertical-rl] rotate-180">
              CONTEXT ▸
            </span>
          </button>
        )}

        {/* lanes — QUEUED + HARVESTED. NO "generating" lane (working-rules §8).
            When a previous run is open (WP1), it replaces the lanes, not the app. */}
        {runView ? (
          <RunHistoryView
            runId={runView.runId}
            manifest={runView.manifest}
            onBack={closeRun}
            onReveal={() => revealRun(runView.runId)}
          />
        ) : (
          <div className="flex min-w-0 flex-1 gap-3.5 p-3.5">
            <QueuedLane
              prompts={queued}
              dialIn={mode === 'dial-in'}
              injectBusy={isRunning || isPaused}
              onInject={(id) => void injectPrompt(id)}
              onImport={(t, m) => void importPrompts(t, m)}
            />
            <HarvestedLane
              items={harvested.map((p) => ({
                id: p.id,
                subject: p.subject,
                savedPath: p.savedPath,
              }))}
            />
          </div>
        )}

        {/* native ChatGPT — the ONLY place "generating" ever shows. Reserved rect;
            main overlays the live WebContentsView here. */}
        <Grabber onMouseDown={gpt.onGrabberDown} dragging={gpt.dragging} />
        <div style={{ width: gpt.width }} className="relative flex flex-shrink-0 flex-col">
          {/* The live view is overlaid on gptRef by main, so it covers anything
              drawn inside it — the ⚑ for this region has to sit OUTSIDE the rect. */}
          {/* The panel's own control strip. Always rendered — it's the only
              honest home for the panel's width, and it keeps those controls
              OUTSIDE the native view's rect where they can still be clicked. */}
          <div className="flex items-center justify-end gap-1.5 border-b border-l border-edge bg-surface px-2 py-1">
            <span className="mr-auto font-mono text-[9px] tracking-wide text-muted">
              ChatGPT — drag the edge, or:
            </span>
            <SizePresets
              presets={[
                { key: 'S', px: 380, title: 'narrow — 380px' },
                { key: 'M', px: 560, title: 'medium — 560px' },
                { key: 'L', px: 820, title: 'wide — 820px, for reading a long reply' },
              ]}
              width={gpt.width}
              onPick={gpt.setWidth}
            />
            <FlagButton
              region="chatgpt"
              snapshot={() => `ChatGPT panel — ${gpt.width}px wide · phase=${phase}`}
            />
          </div>
          <div
            ref={gptRef}
            className="relative flex w-full flex-1 flex-col items-center justify-center border-l border-edge bg-gpt"
          >
          <span className="pointer-events-none absolute right-3 top-2.5 rounded-full border border-dashed border-[#333] px-2 py-0.5 font-mono text-[9px] text-[#6a6a6a]">
            native ChatGPT — live
          </span>
          <span className="px-6 text-center font-mono text-[11px] leading-relaxed text-[#6a6a6a]">
            your logged-in ChatGPT loads here.
            <br />
            first run: sign in once (session persists).
          </span>
          </div>
        </div>
      </div>

      {/* ── footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-edge bg-surface px-4 py-2 text-center text-xs text-muted">
        {activity ? (
          <span className="font-mono text-amber">
            {isPaused ? '⏸ ' : '● '}
            {activity}
          </span>
        ) : flash ? (
          <span className="font-mono text-amber">{flash}</span>
        ) : (
          <>
            Each finished image is <b className="text-amber">auto-harvested</b> from ChatGPT → named →
            routed to the project output dir. We track only <b>Queued</b> and <b>Harvested</b> —
            generating lives in ChatGPT.
          </>
        )}
      </footer>
    </div>
  );
}

/**
 * Run entry chooser (WP5 — THE fix for bug #12). Running a theme is a visible
 * choice BEFORE anything is sent. Whether the chat is primed comes from the
 * MAIN process at open time (advisory-1 #8) — never from renderer memory —
 * and a primed chat puts "Continue in this chat" first, as the default.
 */
function RunEntryButton(props: {
  fetchPrimed: () => Promise<boolean>;
  chunkSize: number;
  onRun: (entry: 'continue' | 'fresh') => void;
  onOpenProject: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [primed, setPrimed] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    void props.fetchPrimed().then((p) => {
      setPrimed(p);
      setOpen(true);
    });
  };
  const pick = (entry: 'continue' | 'fresh'): void => {
    setOpen(false);
    props.onRun(entry);
  };

  const continueBtn = (
    <button
      key="continue"
      type="button"
      onClick={() => pick('continue')}
      className={
        'rounded-md border px-2.5 py-2 text-left ' +
        (primed ? 'border-amber bg-cream hover:brightness-95' : 'border-edge bg-cream hover:border-amber')
      }
    >
      <div className="font-display text-xs font-bold text-brown">
        Continue in this chat{primed ? '  ← default (chat is primed)' : ''}
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-muted">
        keeps everything you dialled in — no new conversation, no primer; starts feeding the
        queue.
      </div>
    </button>
  );
  const freshBtn = (
    <button
      key="fresh"
      type="button"
      onClick={() => pick('fresh')}
      className={
        'rounded-md border px-2.5 py-2 text-left ' +
        (!primed ? 'border-amber bg-cream hover:brightness-95' : 'border-edge bg-cream hover:border-amber')
      }
    >
      <div className="font-display text-xs font-bold text-brown">
        Start a fresh chat{!primed ? '  ← default' : ''}
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-muted">
        new conversation → primer posted → feed. Dialled-in refinements are NOT carried over.
      </div>
    </button>
  );

  return (
    <div className="inline-flex">
      <button
        ref={anchor}
        type="button"
        onClick={toggle}
        className="rounded-md bg-amber px-3.5 py-1.5 font-display text-xs font-bold tracking-wide text-cream hover:brightness-105"
      >
        ▶ Run theme…
      </button>
      {/* Through Popover: this chooser used to open BEHIND the native ChatGPT
          view, so the whole WP5 run-entry choice was invisible and unrunnable. */}
      {open && (
        <Popover anchor={anchor} width={300} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-1.5 p-2">
            {primed ? [continueBtn, freshBtn] : [freshBtn, continueBtn]}
            {primed && (
              <div className="rounded-md border border-amber bg-cream px-2.5 py-2 font-mono text-[10px] leading-relaxed text-brown">
                ⚠ after ~{props.chunkSize} images the run re-primes a fresh chat from the SAVED
                Project.md — refinements living only in this conversation are lost then. Fold them
                into Project first.{' '}
                <button
                  type="button"
                  onClick={props.onOpenProject}
                  className="font-bold text-amber hover:underline"
                >
                  Open Project ↗
                </button>
              </div>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Compact local timestamp for run rows/headers, e.g. "28 Jul 09:41". */
function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * useAutosave (WP2) — draft-edit a persisted string with debounce + blur-flush.
 * The card shows an unmistakable saved/unsaved state; the explicit Save button
 * remains a shortcut, never the only path.
 */
type SaveState = 'saved' | 'dirty' | 'saving';
function useAutosave(
  persistedValue: string,
  save: (v: string) => Promise<boolean>,
): {
  value: string;
  state: SaveState;
  onChange: (v: string) => void;
  flush: () => void;
} {
  const [value, setValue] = useState(persistedValue);
  const [state, setState] = useState<SaveState>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(persistedValue);

  // Follow external changes (e.g. a reload) only while the draft is clean.
  useEffect(() => {
    if (state === 'saved') {
      setValue(persistedValue);
      latest.current = persistedValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedValue]);

  const commit = async (v: string): Promise<void> => {
    setState('saving');
    const ok = await save(v);
    // Only report saved if it worked AND nothing newer was typed mid-flight.
    setState(ok && latest.current === v ? 'saved' : 'dirty');
  };

  const onChange = (v: string): void => {
    setValue(v);
    latest.current = v;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(v), 900);
  };

  const flush = (): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current !== persistedValue) void commit(latest.current);
  };

  return { value, state, onChange, flush };
}

/**
 * A card heading in the context rail.
 *
 * Numbered on purpose: the cards are a SEQUENCE (brand → project → the primer
 * they compose), and an unnumbered stack of boxes gives no hint of that. The
 * hint line says what the card is FOR, which is what was actually missing —
 * snag-2: "I don't know what field it's going into or what the reasoning is."
 */
function CardHeading(props: { step: number; title: string; hint: string }): JSX.Element {
  return (
    <div className="mb-1.5 flex items-baseline gap-1.5">
      <span className="font-mono text-[10px] font-bold text-amber">{props.step}</span>
      <span className="font-display text-[10px] font-bold tracking-[0.15em] text-brown">
        {props.title}
      </span>
      <span className="min-w-0 truncate font-mono text-[9px] text-muted">{props.hint}</span>
    </div>
  );
}

/** The saved/unsaved indicator — text + colour, not just a shape (WP2 bug #6). */
function SaveDot(props: { state: SaveState }): JSX.Element {
  return props.state === 'saved' ? (
    <span className="font-mono text-[10px] text-sage">saved ✓</span>
  ) : props.state === 'saving' ? (
    <span className="font-mono text-[10px] text-amber">saving…</span>
  ) : (
    <span className="font-mono text-[10px] font-bold text-amber">● unsaved</span>
  );
}

/* ── CONTEXT panel — the layered model made visible ───────────────── */
function ContextPanel(props: {
  width: number;
  domain: DomainState | null;
  isRunning: boolean;
  runs: RunSummary[] | null;
  onClose: () => void;
  onSaveProject: (patch: { name?: string; body?: string }) => Promise<boolean>;
  onSaveBrand: (patch: { name?: string; body?: string }) => Promise<boolean>;
  onCreateBrand: (name: string) => void;
  onSwitchBrand: (id: string) => void;
  onCopyPrimer: () => void;
  onCopyPrompt: () => void;
  onCopyText: (text: string, label: string) => void;
  onSwitchProject: (id: string) => void;
  onCreateProject: (name: string, outputDir?: string) => void;
  onChooseDir: () => Promise<string | null>;
  onOpenRun: (runId: string) => void;
}): JSX.Element {
  const d = props.domain;
  const nextQueued = d?.theme.prompts.find((p) => p.status === 'queued');
  const primerPreview = d ? compose(d.brand, d.project) : '';

  return (
    <div
      style={{ width: props.width }}
      className="flex flex-shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-edge bg-surface p-3.5"
    >
      {/* "CONTEXT" alone said nothing about what the cards below it were
          (snag-2: "I don't know what this area is… it just says context").
          The subtitle names the layered model the cards actually implement. */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-display text-[11px] font-bold tracking-[0.18em] text-brown">
            CONTEXT
          </span>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          title="collapse the context rail"
          className="flex-shrink-0 text-muted hover:text-brown"
        >
          ✕
        </button>
      </div>

      {/* Round 1 explained the model in a sentence — which read as more small
          grey prose in a rail already full of it, and wrapped badly when narrow.
          Same fact as a DIAGRAM: the layered model IS a pipeline, so draw the
          pipeline. Chips wrap instead of truncating, so it survives any width. */}
      <div className="rounded-lg border border-edge bg-cream px-2 py-2">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-display text-[11px] font-semibold text-brown">
          <span className="rounded bg-linen px-1.5 py-0.5">BRAND</span>
          <span className="text-muted">+</span>
          <span className="rounded bg-linen px-1.5 py-0.5">PROJECT</span>
          <span className="font-mono text-amber">→</span>
          <span className="rounded bg-yellow px-1.5 py-0.5">PRIMER</span>
        </div>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted">
          Posted <b className="text-brown">once per chat</b>. Every prompt after it inherits
          that look — which is why prompts stay short.
        </p>
      </div>

      {d && (
        <BrandCard
          key={d.activeBrandId}
          domain={d}
          locked={props.isRunning}
          onSave={props.onSaveBrand}
          onCreate={props.onCreateBrand}
          onSwitch={props.onSwitchBrand}
        />
      )}

      {d && (
        <ProjectCard
          key={`p-${d.activeProjectId}`}
          domain={d}
          onSave={props.onSaveProject}
          onSwitch={props.onSwitchProject}
          onCreate={props.onCreateProject}
          onChooseDir={props.onChooseDir}
        />
      )}

      <div className="mt-1 flex items-center justify-between">
        <CardHeading step={3} title="COPY OUT" hint="to paste into ChatGPT by hand" />
        <FlagButton
          region="context-copy"
          snapshot={() =>
            `primer=${primerPreview.length}ch · next queued="${nextQueued?.subject ?? '(none)'}"`
          }
        />
      </div>

      <CopyCard
        label="Copy primer"
        description="Brand + Project composed — posted ONCE per chat to set the look."
        preview={primerPreview}
        onCopy={props.onCopyPrimer}
      />
      <CopyCard
        label="Copy prompt"
        description={
          nextQueued
            ? `The NEXT queued item ("${nextQueued.subject}") — one short prompt, one image.`
            : 'The next queued item — queue is empty right now.'
        }
        preview={nextQueued?.text ?? '(queue empty — import a prompt list first)'}
        onCopy={props.onCopyPrompt}
      />

      <ListPromptCard onCopy={props.onCopyText} />

      {/* run history (WP1) — every previous run of THIS project, from its manifest */}
      <div className="mt-1 flex min-h-0 flex-col">
        <div className="mb-1.5 flex items-center gap-2 font-display text-[11px] font-semibold tracking-widest text-muted">
          RUNS
          <span className="font-mono text-[13px] text-amber">{props.runs?.length ?? '…'}</span>
          <FlagButton
            region="context-runs"
            snapshot={() =>
              `${props.runs?.length ?? 0} runs listed for project "${d?.project.name ?? '?'}"`
            }
          />
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {(props.runs ?? []).map((r) => (
            <button
              key={r.runId}
              type="button"
              onClick={() => props.onOpenRun(r.runId)}
              className="rounded-md border border-edge bg-cream px-2.5 py-1.5 text-left hover:border-amber"
            >
              <div className="font-display text-xs font-semibold text-brown">{r.themeName}</div>
              <div className="font-mono text-[10px] text-muted">
                {fmtWhen(r.startedAt)} · {r.harvested}/{r.total}
                {r.mode === 'dial-in' ? ' · dial-in' : ''}
                {r.outcome === 'stopped' ? ' · stopped' : ''}
              </div>
            </button>
          ))}
          {props.runs?.length === 0 && (
            <p className="font-mono text-[10px] leading-relaxed text-muted opacity-80">
              no runs yet — each Run theme lands in a dated folder here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** "New project" draft — nothing persists until Create (WP1 acceptance). */
function NewProjectForm(props: {
  onCreate: (name: string, outputDir?: string) => void;
  onCancel: () => void;
  onChooseDir: () => Promise<string | null>;
}): JSX.Element {
  const [name, setName] = useState('');
  const [dir, setDir] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber bg-cream p-2.5">
      <div className="font-display text-[11px] font-semibold tracking-widest text-muted">
        NEW PROJECT
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="project name"
        className="w-full rounded-md border border-edge bg-cream p-2 font-display text-xs text-brown outline-none focus:border-amber"
      />
      <button
        type="button"
        onClick={() => {
          void props.onChooseDir().then((d) => {
            if (d) setDir(d);
          });
        }}
        title={dir ?? undefined}
        className="w-full truncate rounded-md border border-edge bg-cream px-2.5 py-1.5 text-left font-mono text-[10px] text-muted hover:border-amber"
      >
        {dir ?? 'output folder… (default: ~/Pictures/ImageDrip)'}
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => props.onCreate(name.trim(), dir ?? undefined)}
          className="flex-1 rounded-md bg-yellow px-3 py-1.5 font-display text-xs font-semibold text-brown enabled:hover:brightness-95 disabled:opacity-50"
        >
          Create
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs text-muted hover:border-amber"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Run history view (WP1) — a previous run, exactly as it ran ───── */
function RunHistoryView(props: {
  runId: string;
  manifest: RunManifest | null;
  onBack: () => void;
  onReveal: () => void;
}): JSX.Element {
  const m = props.manifest;
  const harvested = m?.prompts.filter((p) => p.status === 'harvested' && p.file) ?? [];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={props.onBack}
          className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-brown hover:border-amber"
        >
          ← Back
        </button>
        <span className="min-w-0 truncate font-mono text-xs text-muted">{props.runId}</span>
        {m && (
          <span className="font-mono text-[11px] text-muted">
            {fmtWhen(m.startedAt)} · {m.counts.harvested}/{m.counts.total} harvested
            {m.outcome === 'stopped' ? ' · stopped' : ''}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={props.onReveal}
          className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-brown hover:border-amber"
        >
          Reveal in Finder ↗
        </button>
      </div>

      {!m ? (
        <div className="flex flex-1 items-center justify-center font-mono text-[11px] text-muted">
          loading manifest…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3.5">
          {/* how it ran: the exact primer + every prompt with its outcome */}
          <div className="flex w-[290px] flex-shrink-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-edge bg-surface p-3">
            <div className="font-display text-xs font-semibold tracking-widest text-muted">
              PRIMER — as posted
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-edge bg-cream p-2 font-mono text-[11px] leading-relaxed text-brown">
              {m.primer}
            </pre>
            <div className="font-display text-xs font-semibold tracking-widest text-muted">
              PROMPTS
            </div>
            <div className="flex flex-col gap-1.5">
              {m.prompts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-edge bg-cream px-2.5 py-1.5 text-[12px]"
                  title={p.text}
                >
                  <span className="truncate">{p.subject}</span>
                  <span className="ml-2 flex-shrink-0 font-mono text-[10px] text-muted">
                    {p.status === 'harvested'
                      ? `✓${p.generationMs ? ` ${(p.generationMs / 1000).toFixed(0)}s` : ''}`
                      : p.status === 'refused'
                        ? 'refused'
                        : 'queued'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* the run's harvested grid */}
          <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-edge bg-surface p-3">
            <h4 className="mb-2.5 flex items-center gap-2 font-display text-xs font-semibold tracking-widest text-muted">
              HARVESTED <span className="font-mono text-[13px] text-amber">{harvested.length}</span>
            </h4>
            {harvested.length === 0 ? (
              <div className="flex flex-1 items-center justify-center font-mono text-[11px] text-muted opacity-80">
                nothing was harvested in this run.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] content-start gap-2.5 overflow-auto">
                {harvested.map((p) => (
                  <HarvestThumb
                    key={p.id}
                    subject={p.subject}
                    savedPath={`${m.runId}/${p.file}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── BRAND card (WP2) — editable + selectable; LOCKED only while a run is live ── */
function BrandCard(props: {
  domain: DomainState;
  locked: boolean;
  onSave: (patch: { name?: string; body?: string }) => Promise<boolean>;
  onCreate: (name: string) => void;
  onSwitch: (id: string) => void;
}): JSX.Element {
  const { brand, brands, activeBrandId } = props.domain;
  const name = useAutosave(brand.name, (v) => props.onSave({ name: v }));
  const body = useAutosave(brand.body, (v) => props.onSave({ body: v }));
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const dirty = name.state !== 'saved' || body.state !== 'saved';

  return (
    <div className="rounded-lg border border-edge bg-cream p-2.5">
      {/* Every card carries its own heading. Without one, the name in the box
          reads as a random label — snag-2: "It says Beauty and Joy… I'm not
          sure what I'm looking at… I don't know what field it's going into." */}
      <CardHeading step={1} title="BRAND" hint="the fixed look — locks during runs" />
      <div className="flex items-center justify-between gap-2">
        {props.locked ? (
          <div className="font-display text-sm font-semibold">{brand.name} 🔒</div>
        ) : (
          <input
            value={name.value}
            onChange={(e) => name.onChange(e.target.value)}
            onBlur={name.flush}
            className="w-full rounded-md border border-transparent bg-transparent font-display text-sm font-semibold text-brown outline-none hover:border-edge focus:border-amber"
          />
        )}
        <FlagButton
          region="context-brand"
          snapshot={() =>
            `brand="${brand.name}" (${brands.length} brands) locked=${props.locked} body=${brand.body.length}ch`
          }
        />
        {!props.locked && (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex-shrink-0 font-display text-[11px] text-muted hover:text-amber"
          >
            {creating ? '✕' : '＋ new'}
          </button>
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[11px] text-muted">
        {props.locked ? (
          <span className="text-amber">brand 🔒 locked while a run is live</span>
        ) : (
          <span>brand · editable (locks during runs)</span>
        )}
        {!props.locked && <SaveDot state={dirty ? (name.state === 'saving' || body.state === 'saving' ? 'saving' : 'dirty') : 'saved'} />}
      </div>
      {/* Always rendered. Hiding it below 2 brands meant nothing said that more
          than one brand was even possible — snag-2: "I'm assuming I can have
          other ones. I'm not sure where the list of this would go." */}
      <select
        value={activeBrandId}
        disabled={props.locked || brands.length < 2}
        onChange={(e) => props.onSwitch(e.target.value)}
        title={brands.length < 2 ? 'only one brand so far — ＋ new adds another' : 'switch brand'}
        className="mt-1.5 w-full rounded-md border border-edge bg-cream px-1.5 py-1 font-display text-xs text-brown outline-none focus:border-amber disabled:opacity-60"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {creating && !props.locked && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="brand name"
            className="min-w-0 flex-1 rounded-md border border-edge bg-cream p-1.5 font-display text-xs text-brown outline-none focus:border-amber"
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={() => {
              props.onCreate(newName.trim());
              setNewName('');
              setCreating(false);
            }}
            className="rounded-md bg-yellow px-2.5 py-1 font-display text-xs font-semibold text-brown enabled:hover:brightness-95 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}
      <textarea
        value={body.value}
        onChange={(e) => body.onChange(e.target.value)}
        onBlur={body.flush}
        disabled={props.locked}
        placeholder="Brand.md — the fixed tone…"
        className="mt-2 h-20 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[11px] text-brown outline-none focus:border-amber disabled:opacity-60"
      />
    </div>
  );
}

/* ── PROJECT card (WP2) — name + body autosave; switch / new project (WP1) ── */
function ProjectCard(props: {
  domain: DomainState;
  onSave: (patch: { name?: string; body?: string }) => Promise<boolean>;
  onSwitch: (id: string) => void;
  onCreate: (name: string, outputDir?: string) => void;
  onChooseDir: () => Promise<string | null>;
}): JSX.Element {
  const { project, projects, activeProjectId } = props.domain;
  const name = useAutosave(project.name, (v) => props.onSave({ name: v }));
  const body = useAutosave(project.body, (v) => props.onSave({ body: v }));
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dirty = name.state !== 'saved' || body.state !== 'saved';

  return (
    <>
      <div className="rounded-lg border border-edge bg-cream p-2.5">
        <CardHeading step={2} title="PROJECT" hint="what you tune — this is the dial" />
        <div className="flex items-center justify-between gap-2">
          <input
            value={name.value}
            onChange={(e) => name.onChange(e.target.value)}
            onBlur={name.flush}
            className="w-full rounded-md border border-transparent bg-transparent font-display text-sm font-semibold text-brown outline-none hover:border-edge focus:border-amber"
          />
          <FlagButton
            region="context-project"
            snapshot={() =>
              `project="${project.name}" (${projects.length} projects) outputDir=${project.outputDir ?? '(unset)'} body=${project.body.length}ch`
            }
          />
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex-shrink-0 font-display text-[11px] text-muted hover:text-amber"
          >
            {creating ? '✕' : '＋ new'}
          </button>
        </div>
        <div className="mt-0.5 flex items-center justify-between font-mono text-[11px] text-muted">
          <span>project ✎ editable — autosaves</span>
          <SaveDot state={dirty ? (name.state === 'saving' || body.state === 'saving' ? 'saving' : 'dirty') : 'saved'} />
        </div>
        {projects.length > 1 && (
          <select
            value={activeProjectId}
            onChange={(e) => props.onSwitch(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-edge bg-cream px-1.5 py-1 font-display text-xs text-brown outline-none focus:border-amber"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {project.outputDir && (
          <div className="mt-1.5 flex items-center gap-1">
            <span title={project.outputDir} className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">
              → {project.outputDir}
            </span>
            <FlagButton
              region="context-output"
              snapshot={() => `outputDir=${project.outputDir} project="${project.name}"`}
            />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted">Project.md</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="edit full screen — the rail is too narrow to read a long Project.md"
            className="rounded border border-edge bg-cream px-1.5 py-0.5 font-mono text-[10px] text-muted hover:border-amber hover:text-brown"
          >
            ⤢ expand
          </button>
        </div>
        <textarea
          value={body.value}
          onChange={(e) => body.onChange(e.target.value)}
          onBlur={body.flush}
          placeholder="Project.md — the dialled-in layer…"
          className="mt-1 h-24 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[11px] text-brown outline-none focus:border-amber"
        />
        {/* "Save now" is gone: it duplicated the autosave that already runs on
            debounce and blur, and the saved/unsaved dot above already reports
            the truth. It was pure space (live UAT: "seems a little bit
            redundant… taking up space when we don't need it"). */}
      </div>

      {expanded && (
        <Modal title={`Project.md — ${project.name}`} onClose={() => setExpanded(false)}>
          <textarea
            value={body.value}
            onChange={(e) => body.onChange(e.target.value)}
            onBlur={body.flush}
            autoFocus
            placeholder="Project.md — the dialled-in layer…"
            className="h-[60vh] w-full resize-none rounded-md border border-edge bg-cream p-3 font-mono text-[13px] leading-relaxed text-brown outline-none focus:border-amber"
          />
          <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted">
            <span>{body.value.length} characters · autosaves as you type</span>
            <SaveDot state={body.state} />
          </div>
        </Modal>
      )}

      {creating && (
        <NewProjectForm
          onCreate={(n, dir) => {
            props.onCreate(n, dir);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
          onChooseDir={props.onChooseDir}
        />
      )}
    </>
  );
}

/* ── Copy buttons (WP2) — say what they copy, and show EXACTLY what ── */
function CopyCard(props: {
  label: string;
  description: string;
  preview: string;
  onCopy: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-edge bg-cream">
      {/* The label alone read as a heading, and the ▸ read as a disclosure
          triangle — so nothing on this card looked clickable (live UAT: "we got
          the copy primer and the copy prompt, but there's no actual copy
          button"). The action now looks like a button and says what it does. */}
      <div className="flex items-stretch gap-1 p-1.5">
        <button
          type="button"
          onClick={props.onCopy}
          className="flex-1 rounded-md border border-edge bg-linen px-2.5 py-1.5 text-left font-display text-xs font-semibold text-brown hover:border-amber hover:text-amber"
        >
          ⧉ {props.label}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="preview exactly what will be copied"
          className="rounded-md border border-edge px-2 font-mono text-[10px] text-muted hover:border-amber hover:text-amber"
        >
          {open ? 'hide' : 'peek'}
        </button>
      </div>
      <div className="px-2.5 pb-2 font-mono text-[10px] leading-relaxed text-muted">
        {props.description}
      </div>
      {open && (
        <pre className="mx-2.5 mb-2.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-edge bg-linen p-2 font-mono text-[10px] leading-relaxed text-brown">
          {props.preview}
        </pre>
      )}
    </div>
  );
}

/* ── Listing-prompt helper (WP2 bug #15) — the canned import-list ask ── */
function listPromptText(count: number, subject: string): string {
  return `Give me a list of ${count} ${subject}. Names only, one per line, in a code block, no commentary.`;
}

function ListPromptCard(props: { onCopy: (text: string, label: string) => void }): JSX.Element {
  const [count, setCount] = useState(12);
  const [subject, setSubject] = useState('Australian animals');
  const [text, setText] = useState(() => listPromptText(12, 'Australian animals'));
  const edited = useRef(false);

  const regen = (n: number, s: string): void => {
    if (!edited.current) setText(listPromptText(n, s));
  };

  return (
    <div className="rounded-lg border border-edge bg-cream p-2.5">
      <div className="font-display text-[11px] font-semibold tracking-widest text-muted">
        LIST PROMPT
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-muted">
        ask ChatGPT for an import list — code block, N items, no chatter
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input
          type="number"
          min={1}
          value={count}
          onChange={(e) => {
            const n = Math.max(1, Number(e.target.value) || 1);
            setCount(n);
            regen(n, subject);
          }}
          className="w-14 rounded-md border border-edge bg-cream p-1.5 font-mono text-[11px] text-brown outline-none focus:border-amber"
        />
        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            regen(count, e.target.value);
          }}
          placeholder="subject, e.g. Australian animals"
          className="min-w-0 flex-1 rounded-md border border-edge bg-cream p-1.5 font-mono text-[11px] text-brown outline-none focus:border-amber"
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          edited.current = true;
          setText(e.target.value);
        }}
        className="mt-1.5 h-16 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[10px] leading-relaxed text-brown outline-none focus:border-amber"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => props.onCopy(text, 'list prompt copied')}
          className="flex-1 rounded-md bg-yellow px-2.5 py-1.5 font-display text-xs font-semibold text-brown hover:brightness-95"
        >
          Copy list prompt
        </button>
        {edited.current && (
          <button
            type="button"
            onClick={() => {
              edited.current = false;
              setText(listPromptText(count, subject));
            }}
            className="rounded-md border border-edge bg-cream px-2 py-1.5 font-mono text-[10px] text-muted hover:border-amber"
          >
            reset
          </button>
        )}
      </div>
    </div>
  );
}

/* ── QUEUED lane — what's still to run this theme ─────────────────── */
function QueuedLane(props: {
  prompts: { id: string; subject: string }[];
  /** Dial-in (WP4): rows reveal a manual inject action on hover. */
  dialIn: boolean;
  injectBusy: boolean;
  onInject: (promptId: string) => void;
  onImport: (text: string, mode: 'replace' | 'add') => void;
}): JSX.Element {
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState('');
  // Replace discards queued prompts — it warns first (WP3). Two-step inline.
  const [confirmReplace, setConfirmReplace] = useState(false);

  const incoming = draft
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#')).length;
  const queuedN = props.prompts.length;

  const doImport = (mode: 'replace' | 'add'): void => {
    props.onImport(draft, mode);
    setDraft('');
    setImporting(false);
    setConfirmReplace(false);
  };

  return (
    <div className="flex w-[270px] flex-shrink-0 flex-col rounded-xl border border-edge bg-surface p-3">
      <h4 className="mb-2.5 flex items-center justify-between font-display text-xs font-semibold tracking-widest text-muted">
        <span className="flex items-center gap-2">
          QUEUED <span className="font-mono text-[13px] text-amber">{props.prompts.length}</span>
          <FlagButton
            region="queued"
            snapshot={() =>
              `${props.prompts.length} queued · dialIn=${props.dialIn} · importing=${importing} · next="${props.prompts[0]?.subject ?? '(none)'}"`
            }
          />
        </span>
        <button
          type="button"
          onClick={() => {
            setImporting((v) => !v);
            setConfirmReplace(false);
          }}
          className="font-display text-[11px] text-muted hover:text-amber"
        >
          {importing ? '✕' : '＋ import'}
        </button>
      </h4>

      {importing && (
        <div className="mb-2.5 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'one prompt per line\nor:  subject | prompt body\n# lines are comments'}
            className="h-28 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[11px] outline-none focus:border-amber"
          />
          {queuedN === 0 ? (
            <button
              type="button"
              disabled={incoming === 0}
              onClick={() => doImport('add')}
              className="rounded-md bg-yellow px-3 py-1.5 font-display text-xs font-semibold text-brown enabled:hover:brightness-95 disabled:opacity-50"
            >
              Import {incoming} prompts
            </button>
          ) : confirmReplace ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-amber bg-cream p-2">
              <span className="font-mono text-[10px] leading-relaxed text-brown">
                This discards the {queuedN} queued prompt{queuedN === 1 ? '' : 's'}. Harvested
                tiles are kept.
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => doImport('replace')}
                  className="flex-1 rounded-md bg-amber px-2.5 py-1.5 font-display text-xs font-bold text-cream hover:brightness-105"
                >
                  Replace with {incoming}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReplace(false)}
                  className="rounded-md border border-edge bg-cream px-2.5 py-1.5 font-display text-xs text-muted hover:border-amber"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={incoming === 0}
                onClick={() => doImport('add')}
                className="rounded-md bg-yellow px-3 py-1.5 font-display text-xs font-semibold text-brown enabled:hover:brightness-95 disabled:opacity-50"
              >
                Add {incoming} after the {queuedN} queued → {queuedN + incoming}
              </button>
              <button
                type="button"
                disabled={incoming === 0}
                onClick={() => setConfirmReplace(true)}
                className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-muted enabled:hover:border-amber disabled:opacity-50"
              >
                Replace the {queuedN} queued with {incoming}…
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 overflow-auto">
        {props.prompts.map((p, i) => (
          <div
            key={p.id}
            className="group flex items-center justify-between rounded-md border border-edge bg-cream px-2.5 py-2 text-[13px]"
          >
            <span className="truncate">{p.subject}</span>
            {props.dialIn ? (
              <>
                <span className="font-mono text-[10px] text-gold group-hover:hidden">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  disabled={props.injectBusy}
                  onClick={() => props.onInject(p.id)}
                  title="feed THIS prompt into the live chat and harvest its image"
                  className="hidden flex-shrink-0 rounded bg-amber px-2 py-0.5 font-display text-[10px] font-bold text-cream hover:brightness-105 disabled:opacity-50 group-hover:inline-block"
                >
                  ⚡ inject
                </button>
              </>
            ) : (
              <span className="font-mono text-[10px] text-gold">
                {String(i + 1).padStart(2, '0')}
              </span>
            )}
          </div>
        ))}
        {props.prompts.length === 0 && (
          <p className="mt-2 text-center font-mono text-[11px] text-muted opacity-80">
            queue empty — ＋ import a prompt list
          </p>
        )}
      </div>
    </div>
  );
}

/* ── HARVESTED lane — the star. Only real, harvested images appear here. ── */
function HarvestedLane(props: {
  items: { id: string; subject: string; savedPath?: string }[];
}): JSX.Element {
  const uat = useAppStore((s) => s.uat);
  // Live UAT: tiles become multi-selectable so ONE verdict can cover a whole
  // batch ("everything after the re-prime went washed out"). Selection is
  // renderer-local — it is a review gesture, not app state.
  const [picked, setPicked] = useState<string[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [size, setSize] = useState<TileSize>(
    () => (localStorage.getItem('imagedrip.tileSize') as TileSize) || 'm',
  );
  const selectable = props.items.filter((it) => it.savedPath);

  const setTileSize = (s: TileSize): void => {
    localStorage.setItem('imagedrip.tileSize', s);
    setSize(s);
  };
  const shown = props.items.find((it) => it.id === viewing);

  const toggle = (id: string): void =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const selected = selectable
    .filter((it) => picked.includes(it.id))
    .map((it) => ({ promptId: it.id, savedPath: it.savedPath as string, subject: it.subject }));

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-edge bg-surface p-3">
      <h4 className="mb-2.5 flex items-center gap-2 font-display text-xs font-semibold tracking-widest text-muted">
        HARVESTED <span className="font-mono text-[13px] text-amber">{props.items.length}</span>
        <FlagButton
          region="harvested"
          snapshot={() => `${props.items.length} harvested tiles shown · size=${size}`}
        />
        <span className="flex-1" />
        <VerdictBar selected={selected} onClear={() => setPicked([])} />
        {/* Tile size — small was the only option, and this lane is where the
            time is actually spent looking (iv-5…8: "I should be able to have a
            slider that allows me to change the sizes"). */}
        <span className="flex overflow-hidden rounded-md border border-edge">
          {(['s', 'm', 'l'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTileSize(s)}
              title={`${TILE[s].label} tiles`}
              className={
                'px-1.5 py-0.5 font-mono text-[10px] ' +
                (size === s ? 'bg-yellow text-brown' : 'text-muted hover:bg-linen')
              }
            >
              {s.toUpperCase()}
            </button>
          ))}
        </span>
      </h4>
      {props.items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center font-mono text-[11px] leading-relaxed text-muted opacity-80">
          nothing harvested yet — finished images land here during a run, named + routed to the
          project output dir.
        </div>
      ) : (
        <div
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${TILE[size].px}px, 1fr))`,
          }}
          className="grid content-start gap-2.5 overflow-auto"
        >
          {props.items.map((it) => (
            <HarvestThumb
              key={it.id}
              subject={it.subject}
              savedPath={it.savedPath}
              picked={picked.includes(it.id)}
              onPick={uat && it.savedPath ? () => toggle(it.id) : undefined}
              onOpen={it.savedPath ? () => setViewing(it.id) : undefined}
            />
          ))}
        </div>
      )}

      {shown && (
        <Modal title={fileNameOf(shown)} onClose={() => setViewing(null)}>
          <FullImage savedPath={shown.savedPath as string} subject={shown.subject} />
        </Modal>
      )}
    </div>
  );
}

type TileSize = 's' | 'm' | 'l';
const TILE: Record<TileSize, { px: number; label: string }> = {
  s: { px: 110, label: 'small' },
  m: { px: 170, label: 'medium' },
  l: { px: 280, label: 'large' },
};

/**
 * The REAL filename on disk, not the prompt subject.
 *
 * The caption used to render `{subject}.png`, so a prompt called
 * "Luc Moreau —" displayed as `Luc Moreau —.png` while the actual file was
 * `luc-moreau.png`. That produced four 👎 verdicts asking for lowercase-dash
 * naming that the app was ALREADY doing — the label was the only thing wrong.
 */
function fileNameOf(it: { subject: string; savedPath?: string }): string {
  if (!it.savedPath) return it.subject;
  return it.savedPath.slice(it.savedPath.lastIndexOf('/') + 1);
}

/** Full-size image for the viewer modal. */
function FullImage(props: { savedPath: string; subject: string }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void window.imagedrip.harvestThumb(props.savedPath).then((d) => {
      if (live) setSrc(d);
    });
    return () => {
      live = false;
    };
  }, [props.savedPath]);

  return src ? (
    <img src={src} alt={props.subject} className="mx-auto max-h-[75vh] w-auto max-w-full" />
  ) : (
    <div className="py-16 text-center font-mono text-xs text-muted">loading…</div>
  );
}

/** One harvested tile — loads the real PNG from the scoped harvest root as a data URL. */
function HarvestThumb(props: {
  subject: string;
  savedPath?: string;
  /** Live UAT selection state; `onPick` is undefined when UAT is off. */
  picked?: boolean;
  onPick?: () => void;
  /** Open the full-size viewer. Always available, UAT on or off. */
  onOpen?: () => void;
}): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (props.savedPath) {
      void window.imagedrip.harvestThumb(props.savedPath).then((d) => {
        if (live) setSrc(d);
      });
    }
    return () => {
      live = false;
    };
  }, [props.savedPath]);

  // Click opens the image; the corner checkbox selects it for a verdict. Making
  // the tile itself do double duty would mean you couldn't look at an image
  // without judging it.
  return (
    <div
      onClick={props.onOpen}
      className={
        'group relative aspect-square overflow-hidden rounded-lg border bg-linen ' +
        (props.onOpen ? 'cursor-zoom-in ' : '') +
        (props.picked ? 'border-amber ring-2 ring-amber' : 'border-edge')
      }
    >
      {src && <img src={src} alt={props.subject} className="h-full w-full object-cover" />}
      {props.onPick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onPick?.();
          }}
          title={props.picked ? 'deselect' : 'select for a verdict'}
          className={
            'absolute left-1.5 top-1.5 h-5 w-5 rounded border font-mono text-[11px] leading-none ' +
            (props.picked
              ? 'border-amber bg-amber text-cream'
              : 'border-white/70 bg-black/30 text-transparent hover:text-white/80')
          }
        >
          ✓
        </button>
      )}
      <span
        title={fileNameOf(props)}
        className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-3.5 font-mono text-[10px] text-white"
      >
        <span className="min-w-0 truncate">{fileNameOf(props)}</span>
        <span className="text-[#a7e6b6]">✓</span>
      </span>
    </div>
  );
}

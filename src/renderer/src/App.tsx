import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RunManifest, RunSummary, Rect } from '@shared/ipc';
import { compose, type DomainState } from '@shared/domain';
import { useAppStore } from './store';

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
  } = useAppStore();

  // macOS hides the native title bar (hiddenInset) — so the top bar must be the
  // drag handle, and it must clear the floating traffic-light buttons on the left.
  const isMac = navigator.userAgent.includes('Macintosh');

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
  }, [ctxOpen, mode]);

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
        <span className="flex-1" />

        <div className="flex items-center gap-4 font-mono text-[11px] text-muted">
          <span>
            <b className="font-display text-base text-brown">{harvestedN}</b>/{totalN} harvested
          </span>
          <span>
            re-prime in <b className="text-amber">{reprimeLabel}</b>
          </span>
          <span>{avgLabel}</span>
        </div>

        <div className="flex overflow-hidden rounded-md border border-edge font-display text-xs tracking-wide [-webkit-app-region:no-drag]">
          {(['dial-in', 'auto'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? 'bg-yellow px-3 py-1.5 font-semibold text-brown'
                  : 'px-3 py-1.5 text-muted hover:bg-linen'
              }
            >
              {m === 'dial-in' ? 'Dial-in' : 'Auto'}
            </button>
          ))}
        </div>

        {/* run control — phase-driven primary action */}
        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          {isRunning ? (
            <button
              type="button"
              onClick={() => void pauseRun()}
              className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-brown hover:border-amber"
            >
              ⏸ Pause
            </button>
          ) : isPaused ? (
            <button
              type="button"
              onClick={() => void resumeRun()}
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
            <button
              type="button"
              onClick={() => void startRun()}
              className="rounded-md bg-amber px-3.5 py-1.5 font-display text-xs font-bold tracking-wide text-cream hover:brightness-105"
            >
              ▶ Run theme
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void resetRun()}
              className="rounded-md border border-edge bg-cream px-3 py-1.5 font-display text-xs font-semibold text-muted hover:border-amber"
            >
              ↺ Reset
            </button>
          )}

          <button
            type="button"
            onClick={() => void stopRun()}
            className="rounded-md border border-[#dcaea6] bg-[#f6e4e0] px-3 py-1.5 font-mono text-xs text-[#b5524a] hover:bg-[#f2d7d1]"
          >
            ■ STOP
          </button>
        </div>
      </header>

      {/* ── body ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {ctxOpen ? (
          <ContextPanel
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
              items={harvested.map((p) => ({ subject: p.subject, savedPath: p.savedPath }))}
            />
          </div>
        )}

        {/* native ChatGPT — the ONLY place "generating" ever shows. Reserved rect;
            main overlays the live WebContentsView here. */}
        <div
          ref={gptRef}
          className="relative flex w-[330px] flex-shrink-0 flex-col items-center justify-center border-l border-edge bg-gpt"
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
    <div className="flex w-[240px] flex-shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-edge bg-surface p-3.5">
      <div className="flex items-center justify-between font-display text-[11px] font-semibold tracking-widest text-muted">
        CONTEXT
        <button type="button" onClick={props.onClose} className="text-muted hover:text-brown">
          ✕
        </button>
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
      {brands.length > 1 && (
        <select
          value={activeBrandId}
          disabled={props.locked}
          onChange={(e) => props.onSwitch(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-edge bg-cream px-1.5 py-1 font-display text-xs text-brown outline-none focus:border-amber disabled:opacity-60"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
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
  const dirty = name.state !== 'saved' || body.state !== 'saved';

  return (
    <>
      <div className="rounded-lg border border-edge bg-cream p-2.5">
        <div className="flex items-center justify-between gap-2">
          <input
            value={name.value}
            onChange={(e) => name.onChange(e.target.value)}
            onBlur={name.flush}
            className="w-full rounded-md border border-transparent bg-transparent font-display text-sm font-semibold text-brown outline-none hover:border-edge focus:border-amber"
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
          <div title={project.outputDir} className="mt-1.5 truncate font-mono text-[10px] text-muted">
            → {project.outputDir}
          </div>
        )}
        <textarea
          value={body.value}
          onChange={(e) => body.onChange(e.target.value)}
          onBlur={body.flush}
          placeholder="Project.md — the dialled-in layer…"
          className="mt-2 h-24 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[11px] text-brown outline-none focus:border-amber"
        />
        <button
          type="button"
          onClick={() => {
            name.flush();
            body.flush();
          }}
          className="mt-1.5 w-full rounded-md border border-edge bg-cream px-2.5 py-1.5 text-left font-display text-xs text-brown hover:border-amber"
        >
          Save now ↩ <span className="font-mono text-[10px] text-muted">(autosave has you anyway)</span>
        </button>
      </div>

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
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={props.onCopy}
          className="flex-1 px-2.5 py-2 text-left font-display text-xs text-brown hover:text-amber"
        >
          {props.label}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="preview exactly what will be copied"
          className="px-2.5 font-mono text-[11px] text-muted hover:text-amber"
        >
          {open ? '▾' : '▸'}
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
  items: { subject: string; savedPath?: string }[];
}): JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-edge bg-surface p-3">
      <h4 className="mb-2.5 flex items-center gap-2 font-display text-xs font-semibold tracking-widest text-muted">
        HARVESTED <span className="font-mono text-[13px] text-amber">{props.items.length}</span>
      </h4>
      {props.items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center font-mono text-[11px] leading-relaxed text-muted opacity-80">
          nothing harvested yet — finished images land here during a run, named + routed to the
          project output dir.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] content-start gap-2.5 overflow-auto">
          {props.items.map((it) => (
            <HarvestThumb key={it.subject} subject={it.subject} savedPath={it.savedPath} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One harvested tile — loads the real PNG from the scoped harvest root as a data URL. */
function HarvestThumb(props: { subject: string; savedPath?: string }): JSX.Element {
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

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-edge bg-linen">
      {src && <img src={src} alt={props.subject} className="h-full w-full object-cover" />}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-3.5 font-mono text-[10px] text-white">
        {props.subject}.png <span className="text-[#a7e6b6]">✓</span>
      </span>
    </div>
  );
}

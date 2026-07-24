import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Rect } from '@shared/ipc';
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
    init,
    importPrompts,
    saveProject,
    copyPrimer,
    copyNextPrompt,
    resetRun,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
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
            brandName={domain?.brand.name ?? '—'}
            projectName={domain?.project.name ?? '—'}
            projectBody={domain?.project.body ?? ''}
            onClose={() => setCtx(false)}
            onSaveProject={(b) => void saveProject(b)}
            onCopyPrimer={() => void copyPrimer()}
            onCopyPrompt={() => void copyNextPrompt()}
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

        {/* lanes — QUEUED + HARVESTED. NO "generating" lane (working-rules §8). */}
        <div className="flex min-w-0 flex-1 gap-3.5 p-3.5">
          <QueuedLane prompts={queued} onImport={(t) => void importPrompts(t)} />
          <HarvestedLane
            items={harvested.map((p) => ({ subject: p.subject, savedPath: p.savedPath }))}
          />
        </div>

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

/* ── CONTEXT panel — the layered model made visible ───────────────── */
function ContextPanel(props: {
  brandName: string;
  projectName: string;
  projectBody: string;
  onClose: () => void;
  onSaveProject: (body: string) => void;
  onCopyPrimer: () => void;
  onCopyPrompt: () => void;
}): JSX.Element {
  const [body, setBody] = useState(props.projectBody);
  useEffect(() => setBody(props.projectBody), [props.projectBody]);

  return (
    <div className="flex w-[240px] flex-shrink-0 flex-col gap-2.5 border-r border-edge bg-surface p-3.5">
      <div className="flex items-center justify-between font-display text-[11px] font-semibold tracking-widest text-muted">
        CONTEXT
        <button type="button" onClick={props.onClose} className="text-muted hover:text-brown">
          ✕
        </button>
      </div>

      <div className="rounded-lg border border-edge bg-cream p-2.5">
        <div className="font-display text-sm font-semibold">{props.brandName} 🔒</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">brand · fixed</div>
      </div>

      <div className="rounded-lg border border-edge bg-cream p-2.5">
        <div className="font-display text-sm font-semibold">{props.projectName} ✎</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">project · editable</div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Project.md — the dialled-in layer…"
          className="mt-2 h-24 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[11px] text-brown outline-none focus:border-amber"
        />
      </div>

      <CtxButton onClick={props.onCopyPrimer}>Copy primer</CtxButton>
      <CtxButton onClick={props.onCopyPrompt}>Copy prompt</CtxButton>
      <CtxButton onClick={() => props.onSaveProject(body)}>Save project ↩</CtxButton>
    </div>
  );
}

function CtxButton(props: { onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-md border border-edge bg-cream px-2.5 py-2 text-left font-display text-xs text-brown hover:border-amber"
    >
      {props.children}
    </button>
  );
}

/* ── QUEUED lane — what's still to run this theme ─────────────────── */
function QueuedLane(props: {
  prompts: { id: string; subject: string }[];
  onImport: (text: string) => void;
}): JSX.Element {
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex w-[270px] flex-shrink-0 flex-col rounded-xl border border-edge bg-surface p-3">
      <h4 className="mb-2.5 flex items-center justify-between font-display text-xs font-semibold tracking-widest text-muted">
        <span className="flex items-center gap-2">
          QUEUED <span className="font-mono text-[13px] text-amber">{props.prompts.length}</span>
        </span>
        <button
          type="button"
          onClick={() => setImporting((v) => !v)}
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
          <button
            type="button"
            onClick={() => {
              props.onImport(draft);
              setDraft('');
              setImporting(false);
            }}
            className="rounded-md bg-yellow px-3 py-1.5 font-display text-xs font-semibold text-brown hover:brightness-95"
          >
            Import {draft.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length}{' '}
            prompts
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 overflow-auto">
        {props.prompts.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-md border border-edge bg-cream px-2.5 py-2 text-[13px]"
          >
            {p.subject}
            <span className="font-mono text-[10px] text-gold">
              {String(i + 1).padStart(2, '0')}
            </span>
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

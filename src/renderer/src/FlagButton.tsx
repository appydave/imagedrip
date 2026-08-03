import { useEffect, useRef, useState } from 'react';
import type { Verdict } from '@shared/live-uat';
import { useAppStore } from './store';

/**
 * The Live UAT capture control (`docs/live-uat.md`).
 *
 * One component, two anchors: `FlagButton` raises a screen-anchored Snag,
 * `VerdictComposer` (below) judges harvested images. Both render NOTHING when
 * the ⚑ toggle is off — this is never an always-visible nag over a cockpit
 * meant to be sat in for an hour.
 *
 * The composer autofocuses the note, because the note is the payload. A verdict
 * button on its own is a scalar; a sentence explains the failure, and that is
 * what a later session can actually act on.
 */

const VERDICTS: { key: Verdict; glyph: string; label: string; hint: string }[] = [
  { key: 'down', glyph: '👎', label: 'wrong', hint: 'wrong, broken or missing' },
  { key: 'question', glyph: '❓', label: "don't get it", hint: "I can't tell where this comes from" },
  { key: 'up', glyph: '👍', label: 'good', hint: 'confirmed good — this works' },
  { key: 'idea', glyph: '💡', label: 'idea', hint: 'a wish, not a defect' },
];

/** Verdict picker + note. Shared by both anchors so the two feel identical. */
function Composer(props: {
  title: string;
  subtitle?: string;
  onSave: (verdict: Verdict, note: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [verdict, setVerdict] = useState<Verdict>('down');
  const [note, setNote] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const save = (): void => {
    props.onSave(verdict, note.trim());
    props.onClose();
  };

  return (
    <div
      className="absolute right-0 top-full z-50 mt-1.5 flex w-[290px] flex-col gap-2 rounded-lg border border-amber bg-surface p-2.5 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-[11px] font-bold tracking-widest text-muted">
            {props.title}
          </div>
          {props.subtitle && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted opacity-80">
              {props.subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="flex-shrink-0 text-muted hover:text-brown"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-1">
        {VERDICTS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setVerdict(v.key)}
            title={v.hint}
            className={
              'flex flex-1 flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 ' +
              (verdict === v.key
                ? 'border-amber bg-cream'
                : 'border-edge bg-cream opacity-55 hover:opacity-100')
            }
          >
            <span className="text-[13px] leading-none">{v.glyph}</span>
            <span className="font-mono text-[9px] leading-none text-muted">{v.label}</span>
          </button>
        ))}
      </div>

      <textarea
        ref={ref}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          if (e.key === 'Escape') props.onClose();
        }}
        placeholder="what's wrong, in your words — this sentence is the whole point"
        className="h-20 w-full resize-none rounded-md border border-edge bg-cream p-2 font-mono text-[11px] outline-none focus:border-amber"
      />

      <button
        type="button"
        onClick={save}
        className="rounded-md bg-amber px-3 py-1.5 font-display text-xs font-bold tracking-wide text-cream hover:brightness-105"
      >
        Capture ⌘↵
      </button>
    </div>
  );
}

/**
 * A hover-revealed ⚑ on one screen region — the Snag anchor.
 *
 * `snapshot` is a FUNCTION, evaluated at flag time, so the record freezes what
 * was actually on screen at that moment rather than whatever the props held
 * when the button rendered.
 */
export function FlagButton(props: { region: string; snapshot: () => string }): JSX.Element | null {
  const uat = useAppStore((s) => s.uat);
  const snag = useAppStore((s) => s.snag);
  const [open, setOpen] = useState(false);

  if (!uat) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`flag: ${props.region}`}
        className={
          'rounded px-1 font-mono text-[11px] leading-none ' +
          (open ? 'text-amber' : 'text-muted opacity-45 hover:text-amber hover:opacity-100')
        }
      >
        ⚑
      </button>
      {open && (
        <Composer
          title={props.region}
          onSave={(verdict, note) =>
            void snag({ region: props.region, verdict, note, snapshot: props.snapshot() })
          }
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/**
 * The harvested-grid verdict bar — one verdict over N selected images.
 *
 * Built up front rather than retrofitted: a single run is ~18 images and the
 * same judgment ("all of these went washed out after the re-prime") routinely
 * covers a whole batch. Single-record-only labelling does not survive a real
 * review sitting.
 */
export function VerdictBar(props: {
  selected: { promptId: string; savedPath: string; subject: string }[];
  onClear: () => void;
}): JSX.Element | null {
  const uat = useAppStore((s) => s.uat);
  const verdict = useAppStore((s) => s.verdict);
  const [open, setOpen] = useState(false);

  if (!uat) return null;

  const n = props.selected.length;

  return (
    <span className="relative inline-flex items-center gap-2">
      <span className="font-mono text-[10px] text-muted">
        {n === 0 ? 'click tiles to judge them' : `${n} selected`}
      </span>
      {n > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md bg-amber px-2.5 py-1 font-display text-[11px] font-bold text-cream hover:brightness-105"
          >
            ⚑ judge {n}
          </button>
          <button
            type="button"
            onClick={props.onClear}
            className="font-mono text-[10px] text-muted hover:text-brown"
          >
            clear
          </button>
        </>
      )}
      {open && (
        <Composer
          title={`${n} image${n === 1 ? '' : 's'}`}
          subtitle={props.selected.map((s) => s.subject).join(', ')}
          onSave={(v, note) => {
            void verdict({ items: props.selected, verdict: v, note });
            props.onClear();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/** The ⚑ gate in the top bar. Off by default; the badge proves capture landed. */
export function UatToggle(): JSX.Element {
  const uat = useAppStore((s) => s.uat);
  const counts = useAppStore((s) => s.uatCounts);
  const setUat = useAppStore((s) => s.setUat);
  const total = counts ? counts.snags + counts.verdicts : 0;

  return (
    <span className="flex items-center [-webkit-app-region:no-drag]">
      <button
        type="button"
        onClick={() => setUat(!uat)}
        title={
          uat
            ? 'Live UAT is ON — ⚑ appears on every region, harvested tiles are selectable'
            : 'Live UAT — mark up what is wrong as you see it'
        }
        className={
          'rounded-md border px-2 py-1 font-mono text-[11px] ' +
          (uat ? 'border-amber bg-cream text-amber' : 'border-edge bg-cream text-muted')
        }
      >
        ⚑ UAT{uat ? ' on' : ''}
      </button>
      {uat && total > 0 && (
        <button
          type="button"
          onClick={() => void window.imagedrip.uat.reveal()}
          title="reveal the captured corpus in Finder"
          className="ml-1 font-mono text-[10px] text-amber hover:underline"
        >
          {total}
        </button>
      )}
    </span>
  );
}

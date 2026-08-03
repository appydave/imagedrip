import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Popover — the ONE way to float anything in this cockpit.
 *
 * Two failures forced this, both hit in the live UAT pass on 2026-08-03:
 *
 * 1. **The native panel wins, always.** ChatGPT is a `WebContentsView`
 *    composited over the window, not an element. No z-index reaches it, so a
 *    popover overlapping that rect is simply invisible — which silently ate the
 *    WP5 run-entry chooser ("something dropping down and showing underneath
 *    ChatGPT"). We hide the view for the life of the popover and restore it
 *    after. Hiding is not detaching: the session and any running generation
 *    carry on.
 *
 * 2. **Overflow clips.** The CONTEXT rail is `overflow-y-auto`, so a popover
 *    rendered inside it gets cut off. Portalling to `document.body` with fixed
 *    coordinates escapes every ancestor's clipping.
 *
 * Nesting is refcounted — the panel only comes back when the LAST popover
 * closes, so two overlapping popovers can't restore it out from under each
 * other.
 */

let held = 0;

function acquirePanel(): void {
  held += 1;
  if (held === 1) void window.imagedrip.setPanelVisible(false);
}

function releasePanel(): void {
  held = Math.max(0, held - 1);
  if (held === 0) void window.imagedrip.setPanelVisible(true);
}

export function Popover(props: {
  /** The element to hang off — position is measured from its bounding rect. */
  anchor: RefObject<HTMLElement>;
  width: number;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Hide the native panel for exactly as long as this popover lives.
  useEffect(() => {
    acquirePanel();
    return releasePanel;
  }, []);

  useLayoutEffect(() => {
    const el = props.anchor.current;
    if (!el) return;
    const place = (): void => {
      const r = el.getBoundingClientRect();
      const height = ref.current?.offsetHeight ?? 260;
      // Keep it on screen: clamp to the viewport rather than trusting the anchor.
      const left = Math.max(8, Math.min(r.left, window.innerWidth - props.width - 8));
      const below = r.bottom + 6;
      const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [props.anchor, props.width]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  return createPortal(
    <>
      {/* Backdrop: closes on click AND stops clicks reaching the hidden panel. */}
      <div className="fixed inset-0 z-[9998]" onClick={props.onClose} />
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: props.width,
        }}
        className="z-[9999] rounded-lg border border-amber bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {props.children}
      </div>
    </>,
    document.body,
  );
}

/**
 * Modal — a centred dialog for content the rail is too narrow to hold
 * (Project.md, a harvested image at full size). Same native-panel problem, same
 * refcounted fix.
 */
export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    acquirePanel();
    return releasePanel;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-8"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          <span className="font-display text-sm font-bold text-brown">{props.title}</span>
          <button
            type="button"
            onClick={props.onClose}
            className="font-mono text-sm text-muted hover:text-brown"
          >
            ✕ esc
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{props.children}</div>
      </div>
    </div>,
    document.body,
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A persisted, drag-resizable panel width.
 *
 * Both side panels shipped at a fixed width, and both were too narrow to work
 * in — asked for twice before the live UAT pass finally pinned it down
 * ("the problem I've got with the panel is it's not wide enough still… maybe
 * you can just make it so I can resize it to the size I want", 2026-08-03).
 *
 * The width persists, because a size you have to re-drag every launch is not a
 * setting — it's a chore.
 */
export function useResizable(
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
  /** 'left' grows the panel as you drag right (panel is on the left edge). */
  side: 'left' | 'right',
): { width: number; onGrabberDown: (e: React.MouseEvent) => void; dragging: boolean } {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) && saved > 0 ? clamp(saved, bounds) : fallback;
  });
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });

  const onGrabberDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      start.current = { x: e.clientX, w: width };
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent): void => {
      const delta = e.clientX - start.current.x;
      setWidth(clamp(start.current.w + (side === 'left' ? delta : -delta), bounds));
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Keep the cursor as a resize arrow for the whole drag, not just over the grabber.
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, side, bounds]);

  useEffect(() => {
    localStorage.setItem(key, String(width));
  }, [key, width]);

  return { width, onGrabberDown, dragging };
}

function clamp(v: number, b: { min: number; max: number }): number {
  return Math.max(b.min, Math.min(b.max, v));
}

/** The drag strip. Wide enough to grab, quiet enough to ignore. */
export function Grabber(props: {
  onMouseDown: (e: React.MouseEvent) => void;
  dragging: boolean;
}): JSX.Element {
  return (
    <div
      onMouseDown={props.onMouseDown}
      title="drag to resize — the width is remembered"
      className={
        'group relative w-[6px] flex-shrink-0 cursor-col-resize ' +
        (props.dragging ? 'bg-amber' : 'bg-edge/40 hover:bg-amber/60')
      }
    >
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

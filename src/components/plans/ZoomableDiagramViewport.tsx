import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type ZoomableDiagramViewportProps = {
  children: React.ReactNode;
  className?: string;
  /** Minimum scale (pinch / zoom out) */
  minScale?: number;
  maxScale?: number;
};

/**
 * Pan (drag) + zoom (wheel) for large diagrams. Wheel zooms toward cursor.
 * Use `touch-action: none` so the browser does not steal gestures.
 */
export function ZoomableDiagramViewport({
  children,
  className,
  minScale = 0.3,
  maxScale = 5,
}: ZoomableDiagramViewportProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; tx0: number; ty0: number }>({
    active: false,
    sx: 0,
    sy: 0,
    tx0: 0,
    ty0: 0,
  });
  const viewportRef = useRef<HTMLDivElement>(null);

  scaleRef.current = scale;
  txRef.current = tx;
  tyRef.current = ty;

  const clampScale = useCallback((s: number) => Math.min(maxScale, Math.max(minScale, s)), [minScale, maxScale]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prev = scaleRef.current;
      const delta = -e.deltaY * 0.0012;
      const next = clampScale(prev * (1 + delta));
      const txi = txRef.current;
      const tyi = tyRef.current;
      const worldX = (mx - txi) / prev;
      const worldY = (my - tyi) / prev;
      setTx(mx - worldX * next);
      setTy(my - worldY * next);
      setScale(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampScale]);

  function resetView() {
    setScale(1);
    setTx(0);
    setTy(0);
  }

  function isPanStartTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    return !target.closest('button, a, input, textarea, select, [role="button"], [data-no-pan]');
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (!isPanStartTarget(e.target)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      tx0: txRef.current,
      ty0: tyRef.current,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return;
    const d = dragRef.current;
    setTx(d.tx0 + (e.clientX - d.sx));
    setTy(d.ty0 + (e.clientY - d.sy));
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={viewportRef}
      className={cn(
        'relative h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-slate-100/90',
        className
      )}
      style={{ touchAction: 'none' }}
    >
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1 print:hidden">
        <button
          type="button"
          className="pointer-events-auto rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => setScale((s) => clampScale(s + 0.25))}
        >
          +
        </button>
        <button
          type="button"
          className="pointer-events-auto rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => setScale((s) => clampScale(s - 0.25))}
        >
          −
        </button>
        <button
          type="button"
          className="pointer-events-auto rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={resetView}
        >
          Reset
        </button>
      </div>
      <p className="pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%,280px)] text-[10px] text-slate-500 print:hidden">
        Drag to pan · wheel to zoom · +/− / Reset
      </p>
      <div
        role="application"
        aria-label="Pannable and zoomable drawing"
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="origin-top-left will-change-transform"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TrimDrawingPreview, getInteriorAngleDeg, getCutLengthFromSegments, formatLengthInches, type LineSegment } from '@/components/office/TrimDrawingPreview';

/** Apply new interior angle at bend between segment[index-1] and segment[index]. Updates segment[index].end and translates all later segments. */
function applyAngleAtBend(segments: LineSegment[], index: number, newInteriorAngleDeg: number): LineSegment[] {
  if (index < 1 || index >= segments.length) return segments;
  const prev = segments[index - 1];
  const curr = { ...segments[index], start: { ...segments[index].start }, end: { ...segments[index].end } };
  const dx = curr.end.x - curr.start.x;
  const dy = curr.end.y - curr.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const prevDx = prev.end.x - prev.start.x;
  const prevDy = prev.end.y - prev.start.y;
  const prevAngle = Math.atan2(prevDy, prevDx) * (180 / Math.PI);
  // New segment direction: turn by (180 - interiorAngle) from previous segment's outgoing direction
  const newAngleRad = (prevAngle + (180 - newInteriorAngleDeg)) * (Math.PI / 180);
  const newEnd = {
    x: curr.start.x + len * Math.cos(newAngleRad),
    y: curr.start.y + len * Math.sin(newAngleRad),
  };
  const deltaX = newEnd.x - curr.end.x;
  const deltaY = newEnd.y - curr.end.y;
  const out = segments.map((s, i) => {
    if (i < index) return s;
    if (i === index) return { ...curr, end: newEnd };
    return {
      ...s,
      start: { x: s.start.x + deltaX, y: s.start.y + deltaY },
      end: { x: s.end.x + deltaX, y: s.end.y + deltaY },
    };
  });
  return out;
}

interface TrimDrawingFullScreenViewProps {
  title: string;
  segments: LineSegment[];
  onClose: () => void;
}

export function TrimDrawingFullScreenView({ title, segments: initialSegments, onClose }: TrimDrawingFullScreenViewProps) {
  const [segments, setSegments] = useState<LineSegment[]>(initialSegments);
  const [editingAngleIndex, setEditingAngleIndex] = useState<number | null>(null);
  const [angleInputValue, setAngleInputValue] = useState('');
  const [anglePositions, setAnglePositions] = useState<{ index: number; x: number; y: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });

  // Sync when initial segments change (e.g. different trim opened)
  useEffect(() => {
    setSegments(initialSegments);
    setEditingAngleIndex(null);
  }, [initialSegments]);

  // Measure container and use TrimDrawingPreview (same component as thumbnail) so drawing always works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(rect.width | 0, 400);
      const h = Math.max(rect.height | 0, 300);
      setContainerSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyAngleEdit = useCallback(() => {
    if (editingAngleIndex == null) return;
    const val = parseFloat(angleInputValue);
    if (!Number.isFinite(val) || val <= 0 || val >= 360) return;
    setSegments((prev) => applyAngleAtBend(prev, editingAngleIndex, val));
    setEditingAngleIndex(null);
  }, [editingAngleIndex, angleInputValue]);

  const cancelAngleEdit = useCallback(() => {
    setEditingAngleIndex(null);
  }, []);

  if (!initialSegments.length) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100" style={{ height: '100dvh', minHeight: '100%' }}>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="ml-auto rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
          Cut length: {formatLengthInches(getCutLengthFromSegments(segments))} <span className="text-slate-500 font-normal">(total lineal inches including hem)</span>
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[300px] flex items-center justify-center overflow-auto bg-slate-100 p-4"
      >
        <div
          className="relative shrink-0 shadow-md rounded-lg border border-slate-200 overflow-hidden bg-white"
          style={{ width: containerSize.w, height: containerSize.h }}
        >
          <TrimDrawingPreview
            segments={segments}
            width={containerSize.w}
            height={containerSize.h}
            showMeasurements
            onAnglePositions={setAnglePositions}
            className="block w-full h-full"
          />
          {/* Clickable overlay: double-click opens edit modal */}
          <div className="absolute inset-0 pointer-events-none">
            {anglePositions.map(({ index, x, y }) => (
              <button
                key={index}
                type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded pointer-events-auto min-w-[44px] min-h-[44px] cursor-pointer hover:bg-violet-100/80 focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  left: `${(x / containerSize.w) * 100}%`,
                  top: `${(y / containerSize.h) * 100}%`,
                }}
                title="Double-click to edit angle"
                onDoubleClick={(e) => {
                  e.preventDefault();
                  if (index >= 1 && index < segments.length) {
                    const angle = Math.round(getInteriorAngleDeg(segments[index - 1], segments[index]));
                    setEditingAngleIndex(index);
                    setAngleInputValue(String(angle));
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {editingAngleIndex != null && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white border border-slate-200 rounded-lg shadow-lg p-4 flex flex-col gap-3 min-w-[200px]">
          <p className="text-sm font-medium text-slate-700">Edit bend angle (degrees)</p>
          <input
            type="number"
            min={1}
            max={359}
            step={1}
            value={angleInputValue}
            onChange={(e) => setAngleInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyAngleEdit();
              if (e.key === 'Escape') cancelAngleEdit();
            }}
            className="border border-slate-300 rounded px-3 py-2 text-lg"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelAngleEdit}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyAngleEdit}
              className="px-3 py-1.5 bg-violet-600 text-white rounded hover:bg-violet-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

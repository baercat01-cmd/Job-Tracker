'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { LineSegment, Point } from '@/components/office/TrimDrawingPreview';

function cleanNumber(n: number): string {
  const rounded = Math.round(n * 16) / 16;
  if (rounded % 1 === 0) return String(rounded);
  const [whole, frac] = String(rounded).split('.');
  const denom = 16;
  const num = Math.round((rounded - (whole ? parseInt(whole, 10) : 0)) * denom);
  if (num === 0) return whole || '0';
  if (num === denom) return String((parseInt(whole || '0', 10) || 0) + 1);
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const gcf = g(num, denom);
  const n2 = num / gcf;
  const d = denom / gcf;
  return whole ? `${whole} ${n2}/${d}` : `${n2}/${d}`;
}

function calculateAngleBetweenSegments(seg1: LineSegment, seg2: LineSegment): number {
  const dx1 = seg1.end.x - seg1.start.x;
  const dy1 = seg1.end.y - seg1.start.y;
  const dx2 = seg2.end.x - seg2.start.x;
  const dy2 = seg2.end.y - seg2.start.y;
  const angle1 = Math.atan2(dy1, dx1) * (180 / Math.PI);
  const angle2 = Math.atan2(dy2, dx2) * (180 / Math.PI);
  let diff = angle2 - angle1;
  if (diff < 0) diff += 360;
  if (diff > 360) diff -= 360;
  return 360 - diff; // interior angle
}

function calculateCentroid(segments: LineSegment[]): Point {
  if (segments.length === 0) return { x: 0, y: 0 };
  let sumX = 0, sumY = 0, count = 0;
  segments.forEach((seg) => {
    sumX += seg.start.x + seg.end.x;
    sumY += seg.start.y + seg.end.y;
    count += 2;
  });
  return { x: sumX / count, y: sumY / count };
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync when initial segments change (e.g. different trim opened)
  useEffect(() => {
    setSegments(initialSegments);
    setEditingAngleIndex(null);
  }, [initialSegments]);

  const scaleRef = useRef({ scale: 80, originX: 0, originY: 0, padding: 24 });
  const anglePositionsRef = useRef<{ index: number; x: number; y: number }[]>([]);

  const draw = useCallback(() => {
    if (!segments.length || !canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w < 20 || h < 20) return; // wait for layout

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const padding = 24;
    const points: Point[] = [];
    segments.forEach((seg) => {
      points.push(seg.start, seg.end);
    });
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));
    const boxW = Math.max(maxX - minX + 0.5, 1);
    const boxH = Math.max(maxY - minY + 0.5, 1);
    const scale = Math.min((w - 2 * padding) / boxW, (h - 2 * padding) / boxH, 120);
    const originX = (w - boxW * scale) / 2 + (padding / 2 - minX) * scale;
    const originY = (h - boxH * scale) / 2 + (padding / 2 - minY) * scale;

    canvasRef.current.width = w * dpr;
    canvasRef.current.height = h * dpr;
    ctx.scale(dpr, dpr);
    scaleRef.current = { scale, originX, originY, padding };
    const { scale: s, originX: ox, originY: oy } = scaleRef.current;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(ox, oy);

    const centroid = calculateCentroid(segments);
    const lineWidth = Math.max(2, (s / 60));
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = lineWidth;

    // Draw hems (same style as TrimDrawingPreview)
    segments.forEach((segment) => {
      if (!segment.hasHem) return;
      const hemPoint = segment.hemAtStart ? segment.start : segment.end;
      const other = segment.hemAtStart ? segment.end : segment.start;
      const dx = other.x - hemPoint.x;
      const dy = other.y - hemPoint.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const perpX = (segment.hemSide === 'right' ? uy : -uy);
      const perpY = (segment.hemSide === 'right' ? -ux : ux);
      const lw = 0.03125 * 2;
      const baseX = hemPoint.x + perpX * lw;
      const baseY = hemPoint.y + perpY * lw;
      const p0x = hemPoint.x * s;
      const p0y = hemPoint.y * s;
      const p2x = (baseX + ux * 0.5) * s;
      const p2y = (baseY + uy * 0.5) * s;
      const basePx = baseX * s;
      const basePy = baseY * s;
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.lineTo(basePx, basePy);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(basePx, basePy);
      ctx.stroke();
    });

    // Draw segments and labels
    const anglePositions: { index: number; x: number; y: number }[] = [];
    segments.forEach((segment, segmentIndex) => {
      const startX = segment.start.x * s;
      const startY = segment.start.y * s;
      const endX = segment.end.x * s;
      const endY = segment.end.y * s;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const lengthInInches = Math.sqrt(dx * dx + dy * dy);
      const length = lengthInInches || 1e-6;
      const perpX = -dy / length;
      const perpY = dx / length;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const midInches = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
      const toCentroidX = centroid.x - midInches.x;
      const toCentroidY = centroid.y - midInches.y;
      const direction = perpX * toCentroidX + perpY * toCentroidY > 0 ? -1 : 1;
      const stackOffset = lengthInInches < 1 ? 50 : 40;
      const baseX = midX + perpX * direction * stackOffset;
      const baseY = midY + perpY * direction * stackOffset;

      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(segment.label, baseX, baseY - 10);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`${cleanNumber(lengthInInches)}"`, baseX, baseY + 10);

      if (segmentIndex > 0) {
        const prevSegment = segments[segmentIndex - 1];
        const angle = calculateAngleBetweenSegments(prevSegment, segment);
        const prevDx = prevSegment.end.x - prevSegment.start.x;
        const prevDy = prevSegment.end.y - prevSegment.start.y;
        const currDx = segment.end.x - segment.start.x;
        const currDy = segment.end.y - segment.start.y;
        const prevAngle = Math.atan2(prevDy, prevDx);
        const currAngle = Math.atan2(currDy, currDx);
        const fromCornerBack = prevAngle + Math.PI;
        const fromCornerFwd = currAngle;
        const exteriorBisector = (fromCornerBack + fromCornerFwd) / 2 + Math.PI;
        const angleDistance = Math.max(50, s * 0.6);
        const angleX = startX + Math.cos(exteriorBisector) * angleDistance;
        const angleY = startY + Math.sin(exteriorBisector) * angleDistance;
        anglePositions.push({ index: segmentIndex, x: angleX, y: angleY });
        ctx.fillStyle = '#6b21a8';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`${Math.round(angle)}°`, angleX, angleY);
      }
    });
    anglePositionsRef.current = anglePositions;
    ctx.restore();
  }, [segments]);

  // Run draw after layout (double rAF so flex layout is complete); retry if container not sized yet
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      draw();
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width < 20 || height < 20) requestAnimationFrame(run);
      }
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [draw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !canvasRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (canvasRef.current.width / window.devicePixelRatio) / rect.width;
    const scaleY = (canvasRef.current.height / window.devicePixelRatio) / rect.height;
    const x = (clientX - rect.left) * scaleX - scaleRef.current.originX;
    const y = (clientY - rect.top) * scaleY - scaleRef.current.originY;
    return { x, y };
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = toCanvasCoords(e.clientX, e.clientY);
      if (!pos) return;
      const hitRadius = 28;
      for (const { index, x, y } of anglePositionsRef.current) {
        const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
        if (dist <= hitRadius) {
          const angle = calculateAngleBetweenSegments(segments[index - 1], segments[index]);
          setEditingAngleIndex(index);
          setAngleInputValue(String(Math.round(angle)));
          return;
        }
      }
    },
    [segments, toCanvasCoords]
  );

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
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full" style={{ minHeight: 200 }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-pointer"
          style={{ display: 'block' }}
          onClick={handleCanvasClick}
        />
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

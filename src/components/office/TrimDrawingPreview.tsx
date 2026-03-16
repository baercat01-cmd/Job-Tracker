import { useEffect, useRef } from 'react';

export interface Point {
  x: number;
  y: number;
}

export interface LineSegment {
  id: string;
  start: Point;
  end: Point;
  label: string;
  hasHem?: boolean;
  hemAtStart?: boolean;
  hemSide?: 'left' | 'right';
}

function formatLengthInches(n: number): string {
  const rounded = Math.round(n * 16) / 16;
  if (rounded % 1 === 0) return `${rounded}"`;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const num = Math.round(frac * 16);
  if (num === 0) return whole ? `${whole}"` : '0"';
  if (num === 16) return `${whole + 1}"`;
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const gcf = g(num, 16);
  const n2 = num / gcf;
  const d = 16 / gcf;
  return whole ? `${whole} ${n2}/${d}"` : `${n2}/${d}"`;
}

function interiorAngleDeg(seg1: LineSegment, seg2: LineSegment): number {
  const dx1 = seg1.end.x - seg1.start.x;
  const dy1 = seg1.end.y - seg1.start.y;
  const dx2 = seg2.end.x - seg2.start.x;
  const dy2 = seg2.end.y - seg2.start.y;
  const a1 = Math.atan2(dy1, dx1) * (180 / Math.PI);
  const a2 = Math.atan2(dy2, dx2) * (180 / Math.PI);
  let diff = a2 - a1;
  while (diff < 0) diff += 360;
  while (diff > 360) diff -= 360;
  return 360 - diff;
}

function centroid(segments: LineSegment[]): Point {
  if (!segments.length) return { x: 0, y: 0 };
  let sumX = 0, sumY = 0, count = 0;
  segments.forEach((seg) => {
    sumX += seg.start.x + seg.end.x;
    sumY += seg.start.y + seg.end.y;
    count += 2;
  });
  return { x: sumX / count, y: sumY / count };
}

/** Pick the bisector that places the angle label on the outside of the bend. Top bends: side farther from centroid. Bottom bends: side closer to centroid. */
function getExteriorBisector(prev: LineSegment, curr: LineSegment, centroidPoint: Point): number {
  const corner = curr.start;
  const prevDx = prev.end.x - prev.start.x;
  const prevDy = prev.end.y - prev.start.y;
  const currDx = curr.end.x - curr.start.x;
  const currDy = curr.end.y - curr.start.y;
  const prevAngle = Math.atan2(prevDy, prevDx);
  const currAngle = Math.atan2(currDy, currDx);
  const fromCornerBack = prevAngle + Math.PI;
  const fromCornerFwd = currAngle;
  const bisector1 = (fromCornerBack + fromCornerFwd) / 2;
  const bisector2 = bisector1 + Math.PI;
  const dist = 1;
  const pos1 = { x: corner.x + Math.cos(bisector1) * dist, y: corner.y + Math.sin(bisector1) * dist };
  const pos2 = { x: corner.x + Math.cos(bisector2) * dist, y: corner.y + Math.sin(bisector2) * dist };
  const d1 = Math.hypot(pos1.x - centroidPoint.x, pos1.y - centroidPoint.y);
  const d2 = Math.hypot(pos2.x - centroidPoint.x, pos2.y - centroidPoint.y);
  const isBottomBend = corner.y > centroidPoint.y;
  return isBottomBend ? (d1 < d2 ? bisector1 : bisector2) : (d1 > d2 ? bisector1 : bisector2);
}

export function getInteriorAngleDeg(seg1: LineSegment, seg2: LineSegment): number {
  return interiorAngleDeg(seg1, seg2);
}

/** Segment length in inches (start to end). */
function segmentLengthInches(seg: { start: Point; end: Point }): number {
  const dx = seg.end.x - seg.start.x;
  const dy = seg.end.y - seg.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total linear inches of trim from drawing segments. */
export function getTotalInchesFromSegments(segments: LineSegment[]): number {
  if (!segments?.length) return 0;
  return segments.reduce((sum, seg) => sum + segmentLengthInches(seg), 0);
}

/** Total inches from a trim_saved_config: uses inches array if present, else computes from drawing_segments. */
export function getTotalInchesFromTrimConfig(config: { inches?: unknown; drawing_segments?: unknown } | null): number {
  if (!config) return 0;
  if (config.inches != null) {
    const arr = Array.isArray(config.inches) ? config.inches : (typeof config.inches === 'string' ? JSON.parse(config.inches) : null);
    if (Array.isArray(arr)) return arr.reduce((s: number, n: number) => s + Number(n), 0);
  }
  if (config.drawing_segments != null) {
    const raw = typeof config.drawing_segments === 'string' ? JSON.parse(config.drawing_segments) : config.drawing_segments;
    const segs = Array.isArray(raw) ? raw : null;
    if (segs?.length) return segs.reduce((sum: number, seg: any) => {
      const s = seg?.start && seg?.end ? { start: seg.start, end: seg.end } : null;
      return sum + (s ? segmentLengthInches(s) : 0);
    }, 0);
  }
  return 0;
}

interface TrimDrawingPreviewProps {
  segments: LineSegment[];
  width?: number;
  height?: number;
  className?: string;
  /** When true, draw segment lengths (inches) and bend angles (degrees) on the canvas */
  showMeasurements?: boolean;
  /** Called with canvas-space (x,y) for each angle label when showMeasurements is true; used for click-to-edit overlay */
  onAnglePositions?: (positions: { index: number; x: number; y: number }[]) => void;
  /** When true for bend index i, show (360 - interior angle) instead of interior angle (toggle 90° ↔ 270°) */
  angleDisplayMode?: Record<number, boolean>;
}

/** Draw trim profile from segments (no grid). Used in shop pull form and elsewhere. */
export function TrimDrawingPreview({ segments, width = 280, height = 160, className, showMeasurements = false, onAnglePositions, angleDisplayMode }: TrimDrawingPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!segments?.length || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const pad = 0.5;
    const points: Point[] = [];
    segments.forEach((seg) => {
      points.push(seg.start, seg.end);
      if (seg.hasHem) {
        const hemPoint = seg.hemAtStart ? seg.start : seg.end;
        const other = seg.hemAtStart ? seg.end : seg.start;
        const dx = other.x - hemPoint.x;
        const dy = other.y - hemPoint.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const perpX = (seg.hemSide === 'right' ? uy : -uy);
        const perpY = (seg.hemSide === 'right' ? -ux : ux);
        const lw = 0.03125 * 2;
        const baseX = hemPoint.x + perpX * lw;
        const baseY = hemPoint.y + perpY * lw;
        points.push({ x: baseX + ux * 0.5, y: baseY + uy * 0.5 });
      }
    });
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));
    const boxW = maxX - minX + 2 * pad;
    const boxH = maxY - minY + 2 * pad;
    const scale = Math.min((width - 2) / boxW, (height - 2) / boxH);
    const originX = (width - boxW * scale) / 2 + (pad - minX) * scale;
    const originY = (height - boxH * scale) / 2 + (pad - minY) * scale;

    // Plain white background — no grid (match trim calculator export / PDF style)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(originX, originY);

    const lineWidth = Math.max(2, 3 * (scale / 80));
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = lineWidth;

    segments.forEach((segment) => {
      const startX = segment.start.x * scale;
      const startY = segment.start.y * scale;
      const endX = segment.end.x * scale;
      const endY = segment.end.y * scale;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      if (segment.hasHem) {
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
        const baseX = (hemPoint.x + perpX * lw) * scale;
        const baseY = (hemPoint.y + perpY * lw) * scale;
        const p0x = hemPoint.x * scale;
        const p0y = hemPoint.y * scale;
        const p2x = (hemPoint.x + perpX * lw + ux * 0.5) * scale;
        const p2y = (hemPoint.y + perpY * lw + uy * 0.5) * scale;
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.lineTo(baseX, baseY);
        ctx.lineTo(p2x, p2y);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();
      }
    });

    const anglePositionsOut: { index: number; x: number; y: number }[] = [];

    if (showMeasurements && segments.length > 0) {
      const cent = centroid(segments);
      const fontSize = Math.max(10, 12 * (scale / 80));
      const fontBold = Math.max(12, 16 * (scale / 80));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Measurements only (no A, B, C labels) — drawn off to the side of each segment
      segments.forEach((segment, i) => {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        const lengthInches = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const perpX = -dy / lengthInches;
        const perpY = dx / lengthInches;
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;
        const toCentroidX = cent.x - midX;
        const toCentroidY = cent.y - midY;
        const direction = perpX * toCentroidX + perpY * toCentroidY > 0 ? -1 : 1;
        const offsetPx = lengthInches < 1.0 ? 85 : 70;
        const baseX = midX * scale + perpX * direction * offsetPx;
        const baseY = midY * scale + perpY * direction * offsetPx;
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${fontBold}px sans-serif`;
        ctx.fillText(formatLengthInches(lengthInches), baseX, baseY);
      });

      const centroidPoint = centroid(segments);
      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        const interiorAngle = Math.round(interiorAngleDeg(prev, curr));
        const showComplement = angleDisplayMode?.[i] === true;
        const angle = showComplement ? 360 - interiorAngle : interiorAngle;
        const startX = curr.start.x * scale;
        const startY = curr.start.y * scale;
        const exteriorBisector = getExteriorBisector(prev, curr, centroidPoint);
        const angleDistPx = 28 * (scale / 80);
        const labelX = startX + Math.cos(exteriorBisector) * angleDistPx;
        const labelY = startY + Math.sin(exteriorBisector) * angleDistPx;
        anglePositionsOut.push({ index: i, x: originX + labelX, y: originY + labelY });
        ctx.fillStyle = '#2563eb';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(`${angle}°`, labelX, labelY);
      }
    }

    ctx.restore();
    if (showMeasurements && onAnglePositions && anglePositionsOut.length > 0) {
      onAnglePositions(anglePositionsOut);
    }
  }, [segments, width, height, showMeasurements, onAnglePositions, angleDisplayMode]);

  if (!segments?.length) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
    />
  );
}

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

interface TrimDrawingPreviewProps {
  segments: LineSegment[];
  width?: number;
  height?: number;
  className?: string;
}

/** Draw trim profile from segments (no grid). Used in shop pull form and elsewhere. */
export function TrimDrawingPreview({ segments, width = 280, height = 160, className }: TrimDrawingPreviewProps) {
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

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(originX, originY);

    const lineWidth = Math.max(1.5, 2 * (scale / 80));
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

    ctx.restore();
  }, [segments, width, height]);

  if (!segments?.length) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
    />
  );
}

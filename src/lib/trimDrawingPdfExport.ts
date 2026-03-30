/**
 * Client-side PDF export for trim lines on the job workbook.
 * Portrait letter, multiple trims per page as table rows with compact profile thumbnails.
 */
import type { LineSegment, Point } from '@/components/office/TrimDrawingPreview';

const DEFAULT_HEM_DEPTH_INCHES = 0.5;

/** Narrow surface used when building multi-page trim PDFs (jsPDF instance). */
interface TrimPdfDoc {
  addPage(): void;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  setTextColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g?: number, b?: number): void;
  setFillColor(r: number, g: number, b: number): void;
  setFont(face: string, style: string): void;
  setFontSize(size: number): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  text(
    text: string | string[],
    x: number,
    y: number,
    options?: { lineHeightFactor?: number; maxWidth?: number; align?: string }
  ): void;
  addImage(imageData: string, format: string, x: number, y: number, w: number, h: number): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  save(filename: string): void;
  output(type: 'blob'): Blob;
}

function cleanNumber(num: number, decimals: number = 3): string {
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}

function roundToNearestEighth(num: number): number {
  return Math.round(num * 8) / 8;
}

function formatMeasurementToEighth(num: number): string {
  return cleanNumber(roundToNearestEighth(num), 3);
}

export function parseTrimDrawingSegmentsFromStored(drawing_segments: unknown): LineSegment[] {
  try {
    if (!drawing_segments) return [];
    const raw =
      typeof drawing_segments === 'string' ? JSON.parse(drawing_segments) : drawing_segments;
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0) return [];
    return arr.map((seg: any, index: number) => ({
      id: seg.id ?? `seg-${index}`,
      start:
        seg.start && typeof seg.start.x === 'number' && typeof seg.start.y === 'number'
          ? { x: seg.start.x, y: seg.start.y }
          : { x: 0, y: 0 },
      end:
        seg.end && typeof seg.end.x === 'number' && typeof seg.end.y === 'number'
          ? { x: seg.end.x, y: seg.end.y }
          : { x: 0, y: 0 },
      label: seg.label ?? String.fromCharCode(65 + index),
      hasHem: seg.hasHem === true,
      hemAtStart: seg.hemAtStart === true,
      hemSide: seg.hemSide === 'left' || seg.hemSide === 'right' ? seg.hemSide : 'right',
      hemDepthInches:
        typeof seg.hemDepthInches === 'number' && Number.isFinite(seg.hemDepthInches)
          ? Math.max(0.125, seg.hemDepthInches)
          : undefined,
    }));
  } catch {
    return [];
  }
}

function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (length * length))
  );
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

function chooseLabelDirectionForSpace(
  segment: LineSegment,
  allSegments: LineSegment[],
  preferredDirection: 1 | -1,
  offsetInches: number
): 1 | -1 {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const perpX = -dy / len;
  const perpY = dx / len;
  const mid: Point = {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
  const score = (dir: 1 | -1) => {
    const candidate: Point = {
      x: mid.x + perpX * offsetInches * dir,
      y: mid.y + perpY * offsetInches * dir,
    };
    let minDist = Infinity;
    for (const s of allSegments) {
      if (s.id === segment.id) continue;
      minDist = Math.min(minDist, pointToLineDistance(candidate, s.start, s.end));
    }
    return minDist;
  };
  const prefScore = score(preferredDirection);
  const altDir = (preferredDirection === 1 ? -1 : 1) as 1 | -1;
  const altScore = score(altDir);
  if (altScore > prefScore + 0.02) return altDir;
  return preferredDirection;
}

function getHemDepthForSegment(segment: LineSegment, defaultHemDepthInches: number): number {
  const v = segment.hemDepthInches;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0.125, v);
  return Math.max(0.125, defaultHemDepthInches);
}

function drawHem(
  ctx: CanvasRenderingContext2D,
  segment: LineSegment,
  scale: number,
  lineWidthForExport: number,
  allSegments: LineSegment[],
  defaultHemDepthInches: number
) {
  const hemPoint = segment.hemAtStart ? segment.start : segment.end;
  const otherPoint = segment.hemAtStart ? segment.end : segment.start;
  const dx = otherPoint.x - hemPoint.x;
  const dy = otherPoint.y - hemPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const unitX = dx / length;
  const unitY = dy / length;
  const perpRightX = -unitY;
  const perpRightY = unitX;
  const perpLeftX = unitY;
  const perpLeftY = -unitX;
  const side = segment.hemSide || 'right';
  const perpX = side === 'right' ? perpLeftX : perpRightX;
  const perpY = side === 'right' ? perpLeftY : perpRightY;
  const hemDepth = getHemDepthForSegment(segment, defaultHemDepthInches);
  const oneLineWidth = 0.03125;
  const lineWidthOffset = oneLineWidth * 2;
  const alongX = unitX;
  const alongY = unitY;
  const baseX = hemPoint.x + perpX * lineWidthOffset;
  const baseY = hemPoint.y + perpY * lineWidthOffset;
  const p0x = hemPoint.x * scale;
  const p0y = hemPoint.y * scale;
  const p1x = baseX * scale;
  const p1y = baseY * scale;
  const p2x = (baseX + alongX * hemDepth) * scale;
  const p2y = (baseY + alongY * hemDepth) * scale;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = lineWidthForExport;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p0x, p0y);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.lineTo(p1x, p1y);
  ctx.stroke();
  if (Math.abs(hemDepth - 0.5) > 1e-6) {
    const hemLabelOffsetPx = Math.max(4, 6 * (scale / 80));
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 10px sans-serif';
    const midHemInches = { x: (baseX + (baseX + alongX * hemDepth)) / 2, y: (baseY + (baseY + alongY * hemDepth)) / 2 };
    const offsetInches = hemLabelOffsetPx / scale;
    const score = (sign: 1 | -1) => {
      const candidate: Point = {
        x: midHemInches.x + perpX * offsetInches * sign,
        y: midHemInches.y + perpY * offsetInches * sign,
      };
      let minDist = Infinity;
      for (const s of allSegments) {
        if (s.id === segment.id) continue;
        minDist = Math.min(minDist, pointToLineDistance(candidate, s.start, s.end));
      }
      return minDist;
    };
    const sign: 1 | -1 = score(1) >= score(-1) ? 1 : -1;
    const labelX = (p1x + p2x) / 2 + perpX * hemLabelOffsetPx * sign;
    const labelY = (p1y + p2y) / 2 + perpY * hemLabelOffsetPx * sign;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cleanNumber(hemDepth)}"`, labelX, labelY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function calculateCentroid(segments: LineSegment[]): Point {
  if (segments.length === 0) return { x: 0, y: 0 };
  let sumX = 0,
    sumY = 0,
    count = 0;
  segments.forEach((seg) => {
    sumX += seg.start.x + seg.end.x;
    sumY += seg.start.y + seg.end.y;
    count += 2;
  });
  return { x: sumX / count, y: sumY / count };
}

function getExteriorBisector(prevSegment: LineSegment, segment: LineSegment, centroidPoint: Point): number {
  const corner = segment.start;
  const prevDx = prevSegment.end.x - prevSegment.start.x;
  const prevDy = prevSegment.end.y - prevSegment.start.y;
  const currDx = segment.end.x - segment.start.x;
  const currDy = segment.end.y - segment.start.y;
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
  return isBottomBend ? (d1 < d2 ? bisector1 : bisector2) : d1 > d2 ? bisector1 : bisector2;
}

function getRawTurnDegrees(seg1: LineSegment, seg2: LineSegment): number {
  const dx1 = seg1.end.x - seg1.start.x;
  const dy1 = seg1.end.y - seg1.start.y;
  const dx2 = seg2.end.x - seg2.start.x;
  const dy2 = seg2.end.y - seg2.start.y;
  const angle1 = (Math.atan2(dy1, dx1) * 180) / Math.PI;
  const angle2 = (Math.atan2(dy2, dx2) * 180) / Math.PI;
  let diff = angle2 - angle1;
  if (diff < 0) diff += 360;
  if (diff > 360) diff -= 360;
  return diff;
}

function calculateAngleBetweenSegments(seg1: LineSegment, seg2: LineSegment): number {
  const turn = getRawTurnDegrees(seg1, seg2);
  return Math.min(turn, 360 - turn);
}

function drawTrimToPdfCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  segments: LineSegment[],
  angleDisplayModeRecord: Record<string, boolean>,
  defaultHemDepthInches: number
) {
  if (segments.length === 0) return;
  const pad = 0.5;
  const points: Point[] = [];
  segments.forEach((seg) => {
    points.push(seg.start, seg.end);
    if (seg.hasHem) {
      const hemPoint = seg.hemAtStart ? seg.start : seg.end;
      const other = seg.hemAtStart ? seg.end : seg.start;
      const dx = other.x - hemPoint.x,
        dy = other.y - hemPoint.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len,
        uy = dy / len;
      const perpX = seg.hemSide === 'right' ? uy : -uy;
      const perpY = seg.hemSide === 'right' ? -ux : ux;
      const lw = 0.03125 * 2;
      const baseX = hemPoint.x + perpX * lw,
        baseY = hemPoint.y + perpY * lw;
      const hemDepth = getHemDepthForSegment(seg, defaultHemDepthInches);
      points.push({ x: baseX + ux * hemDepth, y: baseY + uy * hemDepth });
    }
  });
  const angleDistInches = 20 / 80;
  const centroid = calculateCentroid(segments);
  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex > 0) {
      const prevSegment = segments[segmentIndex - 1];
      const exteriorBisector = getExteriorBisector(prevSegment, segment, centroid);
      const cornerX = segment.start.x;
      const cornerY = segment.start.y;
      points.push({
        x: cornerX + Math.cos(exteriorBisector) * angleDistInches,
        y: cornerY + Math.sin(exteriorBisector) * angleDistInches,
      });
    }
  });
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  const boxW = maxX - minX + 2 * pad;
  const boxH = maxY - minY + 2 * pad;
  const scale = Math.min((width - 1) / boxW, (height - 1) / boxH);
  const contentW = boxW * scale;
  const contentH = boxH * scale;
  const originX = (width - contentW) / 2 + (pad - minX) * scale;
  const originY = (height - contentH) / 2 + (pad - minY) * scale;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(originX, originY);

  const mainLineWidth = Math.max(2, 3 * (scale / 80));
  const labelMeasurementGap = 7;
  segments.forEach((segment, segmentIndex) => {
    const startX = segment.start.x * scale;
    const startY = segment.start.y * scale;
    const endX = segment.end.x * scale;
    const endY = segment.end.y * scale;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = mainLineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    if (segment.hasHem) drawHem(ctx, segment, scale, mainLineWidth, segments, defaultHemDepthInches);

    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthInInches = Math.sqrt(dx * dx + dy * dy);
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const length = lengthInInches || 1;
    const perpX = -dy / length;
    const perpY = dx / length;
    const toCentroidX = centroid.x - (segment.start.x + segment.end.x) / 2;
    const toCentroidY = centroid.y - (segment.start.y + segment.end.y) / 2;
    const stackOffset = lengthInInches < 1.0 ? 26 : 18;
    const preferredDirection: 1 | -1 = perpX * toCentroidX + perpY * toCentroidY > 0 ? -1 : 1;
    const chosenDirection = chooseLabelDirectionForSpace(segment, segments, preferredDirection, stackOffset / scale);
    const outwardPerpX = perpX * chosenDirection;
    const outwardPerpY = perpY * chosenDirection;
    const baseX = midX + outwardPerpX * stackOffset;
    const baseY = midY + outwardPerpY * stackOffset;
    const fontSize = Math.max(8, 9 * (scale / 80));
    const fontBold = Math.max(10, 11 * (scale / 80));
    ctx.fillStyle = '#999999';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(segment.label, baseX, baseY - labelMeasurementGap);
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${fontBold}px sans-serif`;
    ctx.fillText(`${formatMeasurementToEighth(lengthInInches)}`, baseX, baseY + labelMeasurementGap);

    if (segmentIndex > 0) {
      const prevSegment = segments[segmentIndex - 1];
      const angle = calculateAngleBetweenSegments(prevSegment, segment);
      const useComplement = angleDisplayModeRecord[segment.id] || false;
      const displayAngle = useComplement ? 360 - angle : angle;
      const exteriorBisector = getExteriorBisector(prevSegment, segment, centroid);
      const angleDist = 20 * (scale / 80);
      const angleX = startX + Math.cos(exteriorBisector) * angleDist;
      const angleY = startY + Math.sin(exteriorBisector) * angleDist;
      ctx.fillStyle = '#2563eb';
      ctx.font = `bold ${Math.max(10, fontSize)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(displayAngle)}°`, angleX, angleY);
    }
  });
  ctx.textAlign = 'left';
  ctx.restore();
}

function renderTrimThumbnailDataUrl(
  segments: LineSegment[],
  widthPx: number,
  heightPx: number,
  dpr: number
): string | null {
  if (segments.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.floor(widthPx * dpr));
  canvas.height = Math.max(8, Math.floor(heightPx * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawTrimToPdfCanvas(ctx, canvas.width, canvas.height, segments, {}, DEFAULT_HEM_DEPTH_INCHES);
  return canvas.toDataURL('image/png');
}

/** Column widths (pt), gaps added between cells. Portrait letter. */
const TABLE_COLS = {
  trim: 118,
  sheet: 68,
  qty: 22,
  len: 36,
  color: 44,
  cut: 44,
  draw: 112,
  gap: 3,
} as const;

function columnStarts(margin: number): number[] {
  const g = TABLE_COLS.gap;
  const w = [
    TABLE_COLS.trim,
    TABLE_COLS.sheet,
    TABLE_COLS.qty,
    TABLE_COLS.len,
    TABLE_COLS.color,
    TABLE_COLS.cut,
    TABLE_COLS.draw,
  ];
  const starts: number[] = [];
  let x = margin;
  for (let i = 0; i < w.length; i++) {
    starts.push(x);
    x += w[i] + (i < w.length - 1 ? g : 0);
  }
  return starts;
}

function drawTableHeader(doc: TrimPdfDoc, y: number, margin: number, tableW: number) {
  const starts = columnStarts(margin);
  const h = 14;
  doc.setFillColor(236, 240, 245);
  doc.rect(margin, y - 10, tableW, h, 'F');
  doc.setDrawColor(180, 190, 200);
  doc.rect(margin, y - 10, tableW, h, 'S');
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const labels = ['Trim', 'Sheet', 'Qty', 'Length', 'Color', 'Cut W.', 'Profile'];
  const widths = [
    TABLE_COLS.trim,
    TABLE_COLS.sheet,
    TABLE_COLS.qty,
    TABLE_COLS.len,
    TABLE_COLS.color,
    TABLE_COLS.cut,
    TABLE_COLS.draw,
  ];
  for (let i = 0; i < labels.length; i++) {
    doc.text(labels[i], starts[i] + 1, y);
  }
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

export type TrimPdfPageInput = {
  title: string;
  sheetLabel?: string;
  qtyDisplay: string;
  lengthDisplay: string;
  colorDisplay: string;
  cutWidthDisplay: string;
  segments: LineSegment[];
};

export function sanitizeTrimPdfFilenameBase(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'Trim-Pack';
}

export type TrimWorkbookPdfOptions = {
  /** Shown under the main title (e.g. job name) */
  reportTitle?: string;
};

const DRAW_BOX_H = 50;
const THUMB_DPR = 2.5;
const ROW_PAD_V = 5;
const TITLE_BLOCK_H = 36;

/**
 * Portrait letter; multiple trim lines per page in a table with thumbnail profiles.
 */
export async function buildTrimWorkbookPdfBlob(
  rows: TrimPdfPageInput[],
  options?: TrimWorkbookPdfOptions
): Promise<Blob> {
  if (rows.length === 0) throw new Error('No trim lines to export');
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'pt', 'letter') as unknown as TrimPdfDoc;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const tableW = pageW - margin * 2;
  const bottom = pageH - margin;

  const starts = columnStarts(margin);
  const colW = [
    TABLE_COLS.trim,
    TABLE_COLS.sheet,
    TABLE_COLS.qty,
    TABLE_COLS.len,
    TABLE_COLS.color,
    TABLE_COLS.cut,
    TABLE_COLS.draw,
  ];

  let y = margin;
  let pageIndex = 0;

  const startNewPage = (continued: boolean) => {
    if (pageIndex > 0) doc.addPage();
    pageIndex++;
    y = margin;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(continued ? 'Trim list (continued)' : 'Trim list', margin, y + 8);
    if (options?.reportTitle?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      doc.text(options.reportTitle.trim(), margin, y + 22);
    }
    y += TITLE_BLOCK_H;
    y = drawTableHeader(doc, y, margin, tableW);
    doc.setTextColor(0, 0, 0);
  };

  startNewPage(false);

  for (const row of rows) {
    const titleLines = doc.splitTextToSize((row.title || '—').trim(), TABLE_COLS.trim - 3);
    const titleShown = titleLines.slice(0, 3);
    const textBlockLines = Math.max(
      titleShown.length,
      1
    );
    const rowBodyH = Math.max(DRAW_BOX_H + ROW_PAD_V * 2, 10 + textBlockLines * 9 + ROW_PAD_V);
    const rowTotalH = rowBodyH + 2;

    if (y + rowTotalH > bottom) {
      startNewPage(true);
    }

    const rowTop = y;
    doc.setDrawColor(210, 215, 220);
    doc.line(margin, rowTop, margin + tableW, rowTop);

    const textY0 = rowTop + ROW_PAD_V + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(titleShown, starts[0] + 1, textY0, { lineHeightFactor: 1.15 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    const sheetTxt = (row.sheetLabel || '').replace(/^Sheet:\s*/i, '').trim() || '—';
    const sheetLines = doc.splitTextToSize(sheetTxt, TABLE_COLS.sheet - 2).slice(0, 2);
    doc.text(sheetLines, starts[1] + 1, textY0, { lineHeightFactor: 1.12 });

    doc.text(row.qtyDisplay?.trim() || '—', starts[2] + 1, textY0);
    doc.text(row.lengthDisplay?.trim() || '—', starts[3] + 1, textY0);
    doc.text(row.colorDisplay?.trim() || '—', starts[4] + 1, textY0);
    doc.text(row.cutWidthDisplay?.trim() || '—', starts[5] + 1, textY0);

    const drawX = starts[6] + 1;
    const drawY = rowTop + ROW_PAD_V;
    const drawW = TABLE_COLS.draw - 2;
    const drawH = DRAW_BOX_H;
    doc.setDrawColor(190, 195, 200);
    doc.rect(drawX, drawY, drawW, drawH, 'S');

    if (row.segments.length > 0) {
      const pxW = drawW * THUMB_DPR;
      const pxH = drawH * THUMB_DPR;
      const dataUrl = renderTrimThumbnailDataUrl(row.segments, pxW, pxH, THUMB_DPR);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'PNG', drawX + 0.5, drawY + 0.5, drawW - 1, drawH - 1);
        } catch {
          doc.setFontSize(6);
          doc.setTextColor(120, 120, 120);
          doc.text('—', drawX + drawW / 2 - 2, drawY + drawH / 2);
          doc.setTextColor(0, 0, 0);
        }
      }
    } else {
      doc.setFontSize(6);
      doc.setTextColor(130, 130, 130);
      doc.text('No drawing', drawX + 3, drawY + drawH / 2 + 2);
      doc.setTextColor(0, 0, 0);
    }

    y = rowTop + rowTotalH;
  }

  doc.setDrawColor(210, 215, 220);
  doc.line(margin, y, margin + tableW, y);

  return doc.output('blob');
}

export async function downloadTrimWorkbookPdf(
  filename: string,
  pages: TrimPdfPageInput[],
  options?: TrimWorkbookPdfOptions
): Promise<void> {
  const blob = await buildTrimWorkbookPdfBlob(pages, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import { useCallback, useEffect, useRef, useState } from 'react';

type PdfDoc = import('pdfjs-dist').PDFDocumentProxy;

const THUMB_MAX = 72;

interface PdfJsDocumentViewerProps {
  /** Blob URL or other URL pdf.js can load */
  url: string;
  title: string;
  className?: string;
}

/**
 * PDF.js viewer with a horizontal thumbnail strip above the page (full-width main canvas).
 * Replaces the browser iframe viewer so thumbnails are not locked to the left sidebar.
 */
export function PdfJsDocumentViewer({ url, title, className = '' }: PdfJsDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [mainWidth, setMainWidth] = useState(600);

  useEffect(() => {
    let cancelled = false;
    let doc: PdfDoc | null = null;

    (async () => {
      try {
        const [{ getDocument, GlobalWorkerOptions }, workerMod] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (cancelled) return;
        const workerUrl = (workerMod as { default?: string }).default;
        if (typeof workerUrl === 'string') {
          GlobalWorkerOptions.workerSrc = workerUrl;
        }
        doc = await getDocument(url).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPageIndex(1);
        setLoadError(false);
      } catch (e) {
        console.error('PdfJsDocumentViewer load failed', e);
        if (!cancelled) {
          setLoadError(true);
          setPdf(null);
          setNumPages(0);
        }
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy?.().catch(() => {});
    };
  }, [url]);

  const measureWidth = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) setMainWidth(w);
  }, []);

  useEffect(() => {
    measureWidth();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureWidth]);

  useEffect(() => {
    if (!pdf || !mainCanvasRef.current || loadError) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    (async () => {
      try {
        const page = await pdf.getPage(pageIndex);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const padding = 16;
        const maxW = Math.max(200, mainWidth - padding);
        const scale = maxW / base.width;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch (e) {
        console.error('PdfJsDocumentViewer page render failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, mainWidth, loadError]);

  if (loadError) {
    return (
      <iframe src={url} className={className} title={title} />
    );
  }

  if (!pdf || numPages < 1) {
    return (
      <div className={`flex flex-col items-center justify-center flex-1 min-h-[200px] gap-3 bg-slate-100 text-muted-foreground ${className}`}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading PDF…</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col min-h-0 flex-1 bg-slate-200 ${className}`}>
      <div
        className="shrink-0 flex gap-2 overflow-x-auto overflow-y-hidden px-2 py-2 border-b border-slate-300 bg-slate-800/95"
        role="tablist"
        aria-label="Page thumbnails"
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <PdfPageThumbnailButton
            key={n}
            pdf={pdf}
            pageNumber={n}
            selected={n === pageIndex}
            onSelect={() => setPageIndex(n)}
          />
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex justify-center p-2 bg-slate-300/80">
        <canvas ref={mainCanvasRef} className="shadow-lg bg-white max-w-full h-auto" aria-label={`${title} page ${pageIndex}`} />
      </div>
      <div className="shrink-0 px-3 py-1.5 border-t border-slate-300 bg-slate-100 text-xs text-slate-600 text-center">
        Page {pageIndex} of {numPages}
      </div>
    </div>
  );
}

function PdfPageThumbnailButton({
  pdf,
  pageNumber,
  selected,
  onSelect,
}: {
  pdf: PdfDoc;
  pageNumber: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = THUMB_MAX / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch {
        /* ignore thumb errors */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`shrink-0 rounded border-2 overflow-hidden transition-colors ${
        selected ? 'border-blue-400 ring-2 ring-blue-500/50' : 'border-slate-600 hover:border-slate-400'
      }`}
      title={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="block bg-white" />
      <span className="sr-only">Page {pageNumber}</span>
    </button>
  );
}

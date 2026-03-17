import { useEffect, useRef, useState } from 'react';

export interface PdfThumbnailProps {
  src: string;
  alt?: string;
  className?: string;
  /** Width of the thumbnail area (used to scale first page to fit). */
  width?: number;
  /** Height of the thumbnail area. */
  height?: number;
  /** Render this when loading or on error. */
  fallback?: React.ReactNode;
}

export function PdfThumbnail({
  src,
  alt = 'PDF',
  className = '',
  width = 144,
  height = 144,
  fallback = null,
}: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!src || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus('error');
      return;
    }

    let cancelled = false;

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

        const pdf = await getDocument(src).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled || !page) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(width / viewport.width, height / viewport.height, 2);
        const scaledViewport = page.getViewport({ scale });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        }).promise;
        if (!cancelled) setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, width, height]);

  if (status === 'error' && fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div className={className} style={{ width, height }}>
      {status === 'loading' && fallback}
      <canvas
        ref={canvasRef}
        aria-label={alt}
        className="w-full h-full object-contain"
        style={{
          display: status === 'ok' ? 'block' : 'none',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />
    </div>
  );
}

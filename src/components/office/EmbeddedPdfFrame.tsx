import { useState, useEffect } from 'react';
import { pdfUrlForIframeViewer } from '@/lib/pdfIframeUrl';

/**
 * Signed storage URLs often use Content-Disposition: attachment, so the browser
 * opens PDFs externally instead of in an iframe. Fetch → blob URL displays inline.
 */
export function EmbeddedPdfFrame({
  url,
  name,
  className = 'w-full h-full min-h-0 flex-1 border-0',
}: {
  url: string;
  name: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<'loading' | 'blob' | 'direct'>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    setPhase('loading');
    setBlobUrl(null);

    (async () => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        const typed =
          blob.type === 'application/pdf' || blob.type === '' || blob.type === 'application/octet-stream'
            ? new Blob([blob], { type: 'application/pdf' })
            : blob;
        const u = URL.createObjectURL(typed);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setBlobUrl(u);
        setPhase('blob');
      } catch {
        if (!cancelled) setPhase('direct');
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (phase === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-slate-50 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading PDF…</p>
      </div>
    );
  }

  if (phase === 'direct') {
    return <iframe src={pdfUrlForIframeViewer(url)} className={className} title={name} />;
  }

  return <iframe src={pdfUrlForIframeViewer(blobUrl!)} className={className} title={name} />;
}

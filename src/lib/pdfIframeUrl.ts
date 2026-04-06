/**
 * Chrome/Edge built-in PDF viewer respects Adobe-style hash params on the document URL.
 * `navpanes=0` collapses the left thumbnail/outline sidebar so the page uses full width.
 */
export function pdfUrlForIframeViewer(url: string): string {
  const hashIdx = url.indexOf('#');
  const base = hashIdx === -1 ? url : url.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? '' : url.slice(hashIdx + 1);
  const sp = new URLSearchParams(fragment);
  sp.set('navpanes', '0');
  const q = sp.toString();
  return q ? `${base}#${q}` : `${base}#navpanes=0`;
}

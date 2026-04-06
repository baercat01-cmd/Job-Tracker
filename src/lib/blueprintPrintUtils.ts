export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'blueprint';
}

export function printSvgFromElement(svg: SVGSVGElement, title: string, totalW: number, totalH: number): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(totalW));
  clone.setAttribute('height', String(totalH));
  const serialized = new XMLSerializer().serializeToString(clone);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
    <style>
      body{margin:0;background:#fff}
      @page{margin:12mm}
      svg{display:block;max-width:100%;height:auto}
    </style></head><body>${serialized}</body></html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}

export function downloadSvgFromElement(svg: SVGSVGElement, filenameBase: string): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(filenameBase)}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

import { corsHeaders } from '../_shared/cors.ts';

/** Allowlist of host patterns that can be proxied (so we're not an open proxy). Empty = allow any HTTPS. */
const ALLOWED_HOST_PATTERNS = [
  /^[a-z0-9.-]+\.azurewebsites\.net$/i,
  /smartbuild/i,
  /postframesolver/i,
  /\.supabase\.co$/i,
  // Add more domains as needed, e.g. /your-viewer\.com$/i
];

function isUrlAllowed(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (ALLOWED_HOST_PATTERNS.length === 0) return true;
  const host = url.hostname;
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(host));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { ...corsHeaders } });
  }

  try {
    const urlParam = new URL(req.url).searchParams.get('url');
    if (!urlParam?.trim()) {
      return new Response('Missing url query parameter', { status: 400, headers: { ...corsHeaders } });
    }

    const targetUrl = new URL(urlParam.trim());
    if (!isUrlAllowed(targetUrl)) {
      return new Response('URL not allowed for proxy', { status: 403, headers: { ...corsHeaders } });
    }

    const resp = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': req.headers.get('User-Agent') || 'Mozilla/5.0 (compatible; ViewerProxy/1.0)',
      },
      redirect: 'follow',
    });

    if (!resp.ok) {
      return new Response(`Upstream returned ${resp.status}`, { status: resp.status, headers: { ...corsHeaders } });
    }

    const contentType = resp.headers.get('Content-Type') || 'text/html; charset=utf-8';
    let body = await resp.text();

    // If HTML, inject <base href="..."> so relative links/scripts resolve to the original site
    const baseHref = targetUrl.origin + targetUrl.pathname.replace(/\/[^/]*$/, '/');
    if (contentType.toLowerCase().includes('text/html') && body.includes('<head')) {
      body = body.replace(/<head(\s[^>]*)?>/i, `<head$1><base href="${baseHref}">`);
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Security-Policy': 'frame-ancestors *',
      },
    });
  } catch (e) {
    console.error('viewer-proxy error:', e);
    return new Response('Proxy error', { status: 500, headers: { ...corsHeaders } });
  }
});

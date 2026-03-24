/**
 * Normalize Supabase RPC payloads that return JSON/JSONB (arrays are not always `Array.isArray` in the client).
 */

export function parseRpcJsonbArray(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data) as unknown;
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object' && !Array.isArray(p)) return [p];
    } catch {
      return [];
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) return [data];
  return [];
}

/** Pick the revision row to open in the portal (matches office “current version” behavior). */
export function resolveLatestJobDocumentRevision(doc: {
  current_version?: number | null;
  job_document_revisions?: unknown;
}): { file_url?: string | null } | null {
  const revs = doc.job_document_revisions;
  if (!Array.isArray(revs) || revs.length === 0) return null;
  const cv = Number(doc.current_version ?? 1);
  const byCurrent = revs.find((r: any) => Number(r?.version_number) === cv);
  if (byCurrent && typeof (byCurrent as { file_url?: string }).file_url === 'string') {
    return byCurrent as { file_url: string };
  }
  const sorted = [...revs].sort(
    (a: any, b: any) => (Number(a?.version_number) || 0) - (Number(b?.version_number) || 0)
  );
  const last = sorted[sorted.length - 1];
  return last && typeof (last as { file_url?: string }).file_url === 'string'
    ? (last as { file_url: string })
    : null;
}

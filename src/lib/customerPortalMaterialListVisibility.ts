/**
 * Single source of truth for “Material list (no prices)” visibility on a portal link.
 * Matches office Customer Portal settings (per-quote → __global → link column → custom_message marker).
 */

const MATERIAL_VIS_MARKER_RE = /^\s*\[\[MB_MATERIALS:(0|1)\]\]\s*/i;

export type PortalMaterialListVisibilityInput = {
  show_material_items_no_prices?: boolean | null;
  visibility_by_quote?: Record<string, unknown> | null;
  custom_message?: string | null;
};

export function stripMaterialVisibilityMarker(
  text: string | null | undefined
): { cleanText: string; markerValue: boolean | null } {
  const source = String(text ?? '');
  const m = source.match(MATERIAL_VIS_MARKER_RE);
  if (!m) return { cleanText: source, markerValue: null };
  return { cleanText: source.replace(MATERIAL_VIS_MARKER_RE, ''), markerValue: m[1] === '1' };
}

export function readEffectiveMaterialListVisibility(
  link: PortalMaterialListVisibilityInput,
  selectedQuoteId: string | null | undefined
): boolean {
  const hasLinkLevelField = typeof link.show_material_items_no_prices === 'boolean';
  if (hasLinkLevelField && link.show_material_items_no_prices === false) {
    return false;
  }

  const byQuote =
    selectedQuoteId &&
    link.visibility_by_quote &&
    typeof link.visibility_by_quote === 'object' &&
    !Array.isArray(link.visibility_by_quote)
      ? (link.visibility_by_quote as Record<string, unknown>)[selectedQuoteId]
      : null;
  if (
    byQuote &&
    typeof byQuote === 'object' &&
    !Array.isArray(byQuote) &&
    'show_material_items_no_prices' in (byQuote as Record<string, unknown>)
  ) {
    return (byQuote as Record<string, unknown>).show_material_items_no_prices === true;
  }

  const global =
    link.visibility_by_quote &&
    typeof link.visibility_by_quote === 'object' &&
    !Array.isArray(link.visibility_by_quote) &&
    (link.visibility_by_quote as Record<string, unknown>).__global &&
    typeof (link.visibility_by_quote as Record<string, unknown>).__global === 'object' &&
    !Array.isArray((link.visibility_by_quote as Record<string, unknown>).__global)
      ? ((link.visibility_by_quote as Record<string, unknown>).__global as Record<string, unknown>)
      : null;
  if (global && 'show_material_items_no_prices' in global) {
    return global.show_material_items_no_prices === true;
  }

  if (hasLinkLevelField) {
    return link.show_material_items_no_prices === true;
  }

  const marker = stripMaterialVisibilityMarker(link.custom_message || '').markerValue;
  if (marker != null) return marker === true;

  return false;
}

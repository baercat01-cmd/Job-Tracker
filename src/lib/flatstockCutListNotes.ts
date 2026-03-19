export const FLATSTOCK_CUT_LIST_DELIM_START = '---FLATSTOCK_CUT_LIST_START---';
export const FLATSTOCK_CUT_LIST_DELIM_END = '---FLATSTOCK_CUT_LIST_END---';

export function upsertFlatstockCutListNotes(
  existingNotes: string | null,
  newBlock: string
): string {
  const base = existingNotes ?? '';
  const startIdx = base.indexOf(FLATSTOCK_CUT_LIST_DELIM_START);
  const endIdx = base.indexOf(FLATSTOCK_CUT_LIST_DELIM_END);

  if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
    const before = base.slice(0, startIdx).trimEnd();
    const after = base.slice(endIdx + FLATSTOCK_CUT_LIST_DELIM_END.length).trimStart();
    return [before, newBlock, after].filter((s) => s && s.trim().length > 0).join('\n\n');
  }

  const trimmed = base.trimEnd();
  const joiner = trimmed.length ? '\n\n' : '';
  return `${trimmed}${joiner}${newBlock}`;
}

export function extractFlatstockCutListSnippet(
  existingNotes: string | null
): string | null {
  const base = existingNotes ?? '';
  const startIdx = base.indexOf(FLATSTOCK_CUT_LIST_DELIM_START);
  if (startIdx < 0) return null;
  const endIdx = base.indexOf(FLATSTOCK_CUT_LIST_DELIM_END);
  if (endIdx < 0 || endIdx <= startIdx) return null;

  return base
    .slice(startIdx + FLATSTOCK_CUT_LIST_DELIM_START.length, endIdx)
    .trim();
}


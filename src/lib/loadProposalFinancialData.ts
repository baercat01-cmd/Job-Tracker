import { supabase } from '@/lib/supabase';

export type ProposalFinancialPayload = {
  materialSheets: any[];
  customRows: any[];
  subcontractorEstimates: any[];
  customRowLineItems: Record<string, any[]>;
  subcontractorLineItems: Record<string, any[]>;
  categoryMarkups: Record<string, number>;
  taxExempt: boolean;
};

/**
 * Loads workbook sheets, line items, labor, custom rows, and subcontractor estimates for a job/quote.
 * Same sources as CustomerPortalManagement / JobFinancials proposal calculations.
 */
export async function loadProposalFinancialData(
  jobId: string,
  quoteId: string | null
): Promise<ProposalFinancialPayload | null> {
  if (!jobId) return null;

  let taxExempt = false;
  if (quoteId) {
    const { data: q } = await supabase.from('quotes').select('tax_exempt').eq('id', quoteId).maybeSingle();
    taxExempt = !!(q as { tax_exempt?: boolean } | null)?.tax_exempt;
  }

  let workbookData: { id: string } | null = null;
  if (quoteId) {
    const { data: wb } = await supabase
      .from('material_workbooks')
      .select('id')
      .eq('job_id', jobId)
      .eq('quote_id', quoteId)
      .eq('status', 'working')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    workbookData = wb ?? null;
    if (!workbookData) {
      const { data: wb2 } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('quote_id', quoteId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      workbookData = wb2 ?? null;
    }
  }
  if (!workbookData) {
    const { data: wb } = await supabase
      .from('material_workbooks')
      .select('id')
      .eq('job_id', jobId)
      .is('quote_id', null)
      .eq('status', 'working')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    workbookData = wb ?? null;
  }
  if (!workbookData) {
    const { data: allWbs } = await supabase
      .from('material_workbooks')
      .select('id')
      .eq('job_id', jobId)
      .order('status', { ascending: false })
      .order('updated_at', { ascending: false });
    workbookData = (allWbs || [])[0] ?? null;
  }

  let materialSheets: any[] = [];
  if (workbookData) {
    const { data: sheetsData } = await supabase
      .from('material_sheets')
      .select('*')
      .eq('workbook_id', workbookData.id)
      .order('order_index');
    let sheets = sheetsData || [];

    let doFallback = sheets.length === 0;
    if (!doFallback && sheets.length > 0) {
      const { count: itemCount } = await supabase
        .from('material_items')
        .select('id', { count: 'exact', head: true })
        .in(
          'sheet_id',
          sheets.map((s: any) => s.id)
        );
      if ((itemCount ?? 0) === 0) doFallback = true;
    }
    if (doFallback) {
      const { data: allWbs } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .order('status', { ascending: false })
        .order('updated_at', { ascending: false });
      for (const wb of allWbs || []) {
        if (wb.id === workbookData.id) continue;
        const { data: altSheets } = await supabase
          .from('material_sheets')
          .select('*')
          .eq('workbook_id', wb.id)
          .order('order_index');
        if ((altSheets || []).length > 0) {
          const { count: c } = await supabase
            .from('material_items')
            .select('id', { count: 'exact', head: true })
            .in(
              'sheet_id',
              (altSheets || []).map((s: any) => s.id)
            );
          if ((c ?? 0) > 0) {
            sheets = altSheets!;
            workbookData = wb;
            break;
          }
        }
      }
    }

    const sheetIds = sheets.map((s: any) => s.id);
    for (const sheet of sheets) {
      const [{ data: items }, { data: laborRows }, { data: catMarkups }] = await Promise.all([
        supabase.from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index'),
        supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id),
        supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id),
      ]);
      (sheet as any).items = items || [];
      (sheet as any).laborTotal = (laborRows || []).reduce(
        (s: number, l: any) => s + (l.total_labor_cost ?? (l.estimated_hours ?? 0) * (l.hourly_rate ?? 0)),
        0
      );
      const catMarkupMap: Record<string, number> = {};
      (catMarkups || []).forEach((cm: any) => {
        catMarkupMap[cm.category_name] = cm.markup_percent ?? 10;
      });
      (sheet as any).categoryMarkups = catMarkupMap;
    }
    if (sheetIds.length > 0) {
      const { data: sheetLineItems } = await supabase
        .from('custom_financial_row_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .is('row_id', null)
        .order('order_index');
      const bySheet: Record<string, any[]> = {};
      (sheetLineItems || []).forEach((item: any) => {
        const sid = item.sheet_id;
        if (sid) {
          if (!bySheet[sid]) bySheet[sid] = [];
          bySheet[sid].push(item);
        }
      });
      sheets.forEach((sheet: any) => {
        (sheet as any).sheetLinkedItems = bySheet[sheet.id] || [];
      });
    }
    materialSheets = sheets;
  }

  let customRowsData: any[] = [];
  if (quoteId) {
    const [forQuote, forJob] = await Promise.all([
      supabase
        .from('custom_financial_rows')
        .select('*, custom_financial_row_items(*)')
        .eq('quote_id', quoteId)
        .order('order_index'),
      supabase
        .from('custom_financial_rows')
        .select('*, custom_financial_row_items(*)')
        .eq('job_id', jobId)
        .is('quote_id', null)
        .order('order_index'),
    ]);
    const quoteRowIds = new Set((forQuote.data || []).map((r: any) => r.id));
    customRowsData = [...(forQuote.data || []), ...(forJob.data || []).filter((r: any) => !quoteRowIds.has(r.id))].sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    );
  } else {
    const { data } = await supabase
      .from('custom_financial_rows')
      .select('*, custom_financial_row_items(*)')
      .eq('job_id', jobId)
      .order('order_index');
    customRowsData = data || [];
  }

  let subEstimatesData: any[] = [];
  if (quoteId) {
    const [forQuote, forJob] = await Promise.all([
      supabase
        .from('subcontractor_estimates')
        .select('*, subcontractor_estimate_line_items(*)')
        .eq('quote_id', quoteId)
        .order('order_index'),
      supabase
        .from('subcontractor_estimates')
        .select('*, subcontractor_estimate_line_items(*)')
        .eq('job_id', jobId)
        .is('quote_id', null)
        .order('order_index'),
    ]);
    const quoteSubIds = new Set((forQuote.data || []).map((r: any) => r.id));
    subEstimatesData = [...(forQuote.data || []), ...(forJob.data || []).filter((r: any) => !quoteSubIds.has(r.id))].sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    );
  } else {
    const { data } = await supabase
      .from('subcontractor_estimates')
      .select('*, subcontractor_estimate_line_items(*)')
      .eq('job_id', jobId)
      .order('order_index');
    subEstimatesData = data || [];
  }

  const customRowLineItems: Record<string, any[]> = {};
  (customRowsData || []).forEach((row: any) => {
    customRowLineItems[row.id] = row.custom_financial_row_items || [];
  });

  const subcontractorLineItems: Record<string, any[]> = {};
  (subEstimatesData || []).forEach((est: any) => {
    subcontractorLineItems[est.id] = est.subcontractor_estimate_line_items || [];
  });

  const categoryMarkups: Record<string, number> = {};
  (materialSheets || []).forEach((sheet: any) => {
    Object.entries(sheet.categoryMarkups || {}).forEach(([cat, markup]) => {
      if (categoryMarkups[cat] === undefined) {
        categoryMarkups[cat] = markup as number;
      }
    });
  });

  return {
    materialSheets: materialSheets || [],
    customRows: customRowsData || [],
    subcontractorEstimates: subEstimatesData || [],
    customRowLineItems,
    subcontractorLineItems,
    categoryMarkups,
    taxExempt,
  };
}

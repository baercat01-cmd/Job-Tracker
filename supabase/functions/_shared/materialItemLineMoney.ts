/**
 * Keep in sync with src/lib/materialItemLineMoney.ts (Supabase Edge cannot import from /src).
 */

export interface MaterialItemLineMoneyInput {
  category: string;
  quantity: number;
  length?: string | null;
  cost_per_unit?: number | null;
  price_per_unit?: number | null;
  extended_cost?: number | null;
  extended_price?: number | null;
  sku?: string | null;
}

export type MetalCatalogBySku = Record<string, { purchase_cost: number; unit_price: number }>;

export function parseLengthToFeet(length: string | null | undefined): number | null {
  if (length == null || String(length).trim() === '') return null;
  const s = String(length).trim();
  const ftInMatch = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*[""]?\s*)?$/);
  if (ftInMatch) {
    const feet = parseFloat(ftInMatch[1]);
    const inches = ftInMatch[2] != null ? parseFloat(ftInMatch[2]) : 0;
    if (!Number.isFinite(feet)) return null;
    return feet + (Number.isFinite(inches) ? inches / 12 : 0);
  }
  const num = parseFloat(s);
  if (Number.isFinite(num) && num >= 0) return num;
  return null;
}

function getMetalPlf(
  item: MaterialItemLineMoneyInput,
  metalCatalogBySku?: MetalCatalogBySku
): { costPerFoot: number; pricePerFoot: number } | null {
  if (item.category !== 'Metal' || !item.sku) return null;
  if (item.cost_per_unit != null || item.price_per_unit != null) return null;
  const cat = metalCatalogBySku?.[item.sku];
  if (!cat || (cat.purchase_cost === 0 && cat.unit_price === 0)) return null;
  return {
    costPerFoot: cat.purchase_cost,
    pricePerFoot: cat.unit_price,
  };
}

function getMetalCostPerFootDisplay(
  item: MaterialItemLineMoneyInput,
  metalCatalogBySku?: MetalCatalogBySku
): number | null {
  if (item.category !== 'Metal') return null;
  if (item.cost_per_unit != null) return Number(item.cost_per_unit);
  return getMetalPlf(item, metalCatalogBySku)?.costPerFoot ?? null;
}

function getMetalPricePerFootDisplay(
  item: MaterialItemLineMoneyInput,
  metalCatalogBySku?: MetalCatalogBySku
): number | null {
  if (item.category !== 'Metal') return null;
  if (item.price_per_unit != null) return Number(item.price_per_unit);
  return getMetalPlf(item, metalCatalogBySku)?.pricePerFoot ?? null;
}

export function getMaterialLineSellAndCost(
  item: MaterialItemLineMoneyInput,
  metalCatalogBySku?: MetalCatalogBySku
): { cost: number; price: number } {
  const qty = Number(item.quantity) || 1;
  const lengthFeetMetal = item.category === 'Metal' ? parseLengthToFeet(item.length) : null;
  let pieceCost: number | null = null;
  let piecePrice: number | null = null;

  if (item.category === 'Metal' && lengthFeetMetal != null && lengthFeetMetal > 0) {
    const cFt = getMetalCostPerFootDisplay(item, metalCatalogBySku);
    const pFt = getMetalPricePerFootDisplay(item, metalCatalogBySku);
    if (cFt != null) pieceCost = cFt * lengthFeetMetal;
    if (pFt != null) piecePrice = pFt * lengthFeetMetal;
  } else {
    pieceCost = item.cost_per_unit != null ? Number(item.cost_per_unit) : null;
    piecePrice = item.price_per_unit != null ? Number(item.price_per_unit) : null;
  }

  return {
    cost: pieceCost != null ? pieceCost * qty : Number(item.extended_cost) || 0,
    price: piecePrice != null ? piecePrice * qty : Number(item.extended_price) || 0,
  };
}

export function zohoRateFromLineTotal(lineTotal: number, billedQuantity: number): number {
  const q = Number(billedQuantity);
  if (!Number.isFinite(q) || q <= 0) return lineTotal;
  return lineTotal / q;
}

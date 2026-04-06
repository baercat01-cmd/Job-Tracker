/** Display decimal feet as architectural feet-inches (e.g. 12'-6"). */
export function formatArchitecturalFeet(decimalFeet: number): string {
  if (!Number.isFinite(decimalFeet)) return '—';
  const sign = decimalFeet < 0 ? '-' : '';
  let v = Math.abs(decimalFeet);
  const feet = Math.floor(v + 1e-9);
  let inches = Math.round((v - feet) * 12);
  if (inches >= 12) {
    return formatArchitecturalFeet((sign === '-' ? -1 : 1) * (feet + 1));
  }
  if (inches === 0) return `${sign}${feet}'-0"`;
  return `${sign}${feet}'-${inches}"`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Simplify n/16 for display (e.g. 8 → 1/2). */
function fractionSixteenths(n: number): string {
  if (n <= 0 || n >= 16) return '';
  const g = gcd(n, 16);
  return `${n / g}/${16 / g}`;
}

/**
 * Feet and inches rounded to the nearest 1/16″ (e.g. 76′-5 13/16″).
 * For field drawings / squaring diagonals.
 */
export function formatArchitecturalFeetDetailed(decimalFeet: number): string {
  if (!Number.isFinite(decimalFeet)) return '—';
  const sign = decimalFeet < 0 ? '-' : '';
  const ts = Math.round(Math.abs(decimalFeet) * 12 * 16);
  const feet = Math.floor(ts / (12 * 16));
  let rem = ts % (12 * 16);
  const wholeIn = Math.floor(rem / 16);
  const frac = rem % 16;
  let inchPart: string;
  if (frac === 0) {
    inchPart = `${wholeIn}`;
  } else if (wholeIn === 0) {
    inchPart = fractionSixteenths(frac);
  } else {
    inchPart = `${wholeIn} ${fractionSixteenths(frac)}`;
  }
  return `${sign}${feet}'-${inchPart}"`;
}

/** Whole feet only when close to integer; else architectural. */
export function formatFeetForPlan(decimalFeet: number): string {
  if (!Number.isFinite(decimalFeet)) return '—';
  const rounded = Math.round(decimalFeet * 16) / 16;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return `${Math.round(rounded)}'`;
  }
  return formatArchitecturalFeet(decimalFeet);
}

import XLSX from 'xlsx';
import path from 'path';

const fp =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Chupp_Remodel_Material_Workbook_2026-03-18.xlsx');

const wb = XLSX.readFile(fp);
console.log('File:', fp);
console.log('Sheets:', wb.SheetNames);

const sn =
  wb.SheetNames.find((n) => /268/i.test(n) && /siding/i.test(n)) ||
  wb.SheetNames.find((n) => /siding/i.test(n)) ||
  wb.SheetNames[0];

const sheet = wb.Sheets[sn];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
const headers = (rows[0] || []).map((h) => String(h || '').trim());
console.log('\nSheet:', sn);
console.log('Headers:', headers);

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const obj = {};
  headers.forEach((h, j) => {
    if (h) obj[h] = r[j];
  });
  const cat = String(obj.Category ?? obj.category ?? '').toLowerCase();
  if (cat.includes('fast')) {
    console.log('\nFastners row', i, obj);
  }
}

const maxByCol = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  headers.forEach((h, j) => {
    if (!h) return;
    const v = r[j];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const a = Math.abs(v);
      const prev = maxByCol[h];
      if (prev == null || a > Math.abs(prev)) maxByCol[h] = v;
    }
  });
}
console.log('\nMax magnitude per numeric column:', maxByCol);

# Installing XLSX Library

The Material Workbook Manager requires the `xlsx` library to parse Excel files.

## Installation

Run this command in your project directory:

```bash
npm install xlsx
```

Or with yarn:

```bash
yarn add xlsx
```

## Why is this needed?

The Material Workbook system parses Excel (.xlsx) files with multiple sheets to import material data. The `xlsx` library is the industry-standard library for reading and writing Excel files in JavaScript.

## After Installation

Once installed, the Material Workbook Manager will be able to:
- Upload entire Excel workbooks with multiple sheets
- Parse each sheet as a separate material section (Main Building, Porch, Interior, etc.)
- Extract all columns including Category, Usage, SKU, Material, Qty, Length, Cost, Markup, etc.
- Create versioned workbooks in "working" mode for quoting
- Lock versions when finalized for change tracking

## Troubleshooting

If you see errors about "cannot find module 'xlsx'", make sure to:
1. Run `npm install xlsx` in your terminal
2. Restart your development server
3. Clear your build cache if needed

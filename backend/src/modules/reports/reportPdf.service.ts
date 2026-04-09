import puppeteer from 'puppeteer';

// ---------------------------------------------------------------------------
// Types — mirrors report.service response shape
// ---------------------------------------------------------------------------
interface StockOpnameItem {
  productId: string;
  sku: string;
  productName: string;
  uomCode: string;
  startingQty: number;
  inboundQty: number;
  outboundQty: number;
  systemQty: number;
  physicalQty: number | null;
  variance: number | null;
}

interface StockOpnameCategory {
  categoryId: string;
  categoryName: string;
  items: StockOpnameItem[];
}

interface StockOpnameLocation {
  locationId: string;
  locationCode: string;
  locationName: string;
  categories: StockOpnameCategory[];
}

interface StockOpnameReport {
  generatedAt: string;
  filters: {
    startDate: string;
    endDate: string;
    locationIds: string[] | null;
    categoryIds: string[] | null;
  };
  locations: StockOpnameLocation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtQty(n: number | null): string {
  if (n === null || n === undefined) return '';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// HTML generator — mirrors StockOpnamePreview layout exactly
// ---------------------------------------------------------------------------
export function generateStockOpnameHTML(report: StockOpnameReport): string {
  // Sort: locations by name → categories by name → items by SKU
  // (same ordering as frontend StockOpnamePreview)
  const sortedLocations = [...report.locations]
    .sort((a, b) => a.locationName.localeCompare(b.locationName))
    .map((loc) => ({
      ...loc,
      categories: [...loc.categories]
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
        .map((cat) => ({
          ...cat,
          items: [...cat.items].sort((a, b) => a.sku.localeCompare(b.sku)),
        })),
    }));

  const hasAnyItems = sortedLocations.some((loc) =>
    loc.categories.some((cat) => cat.items.length > 0),
  );

  // Build location sections
  const locationSections = sortedLocations
    .filter((loc) => loc.categories.some((cat) => cat.items.length > 0))
    .map((loc, locIndex) => {
      const pageBreak = locIndex === 0 ? '' : 'page-break-before: always;';

      const categorySections = loc.categories
        .filter((cat) => cat.items.length > 0)
        .map((cat) => {
          const rows = cat.items
            .map(
              (item) => `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;font-family:monospace;">${escapeHtml(item.sku)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;">${escapeHtml(item.productName)}</td>
              <td class="number" style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;text-align:right;">${fmtQty(item.startingQty)}</td>
              <td class="number" style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;text-align:right;">${fmtQty(item.inboundQty)}</td>
              <td class="number" style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;text-align:right;">${fmtQty(item.outboundQty)}</td>
              <td class="number" style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;text-align:right;">${fmtQty(item.systemQty)}</td>
              <td class="number" style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;text-align:right;">${fmtQty(item.physicalQty)}</td>
              <td class="number" style="padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:11px;text-align:right;">${fmtQty(item.variance)}</td>
            </tr>`,
            )
            .join('');

          return `
          <div style="margin-bottom:20px;">
            <h3 style="font-size:13px;font-weight:700;margin:0 0 6px 0;color:#222;">Category: ${escapeHtml(cat.categoryName)}</h3>
            <table style="width:100%;border-collapse:collapse;table-layout:auto;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">SKU</th>
                  <th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">Name</th>
                  <th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">Starting Qty</th>
                  <th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">Inbound Qty</th>
                  <th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">Outbound Qty</th>
                  <th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">System Qty</th>
                  <th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">Physical Qty</th>
                  <th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid #000;border-top:1.5px solid #000;font-weight:700;font-size:11px;background-color:#fafafa;white-space:nowrap;">Variance</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>`;
        })
        .join('');

      return `
      <section style="${pageBreak}margin-bottom:28px;">
        <h2 style="font-size:15px;font-weight:700;margin:0 0 12px 0;padding-bottom:4px;border-bottom:2px solid #000;">
          Location: ${escapeHtml(loc.locationName)}
          <span style="font-weight:400;color:#555;">(${escapeHtml(loc.locationCode)})</span>
        </h2>
        ${categorySections}
      </section>`;
    })
    .join('');

  const noDataSection = !hasAnyItems
    ? `<div style="text-align:center;padding:40px 0;font-size:13px;color:#666;border:1px dashed #ccc;">
        No data available for selected filters
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Stock Opname Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    h1 { font-size: 18px; margin-bottom: 10px; }
    h2 { font-size: 14px; margin-top: 20px; }
    h3 { font-size: 12px; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: none; padding: 6px; }
    th { font-weight: bold; }
    td.number { text-align: right; }
    thead { display: table-header-group; }
    @media print {
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div style="padding:32px 36px;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;">
    <!-- Report header -->
    <div style="margin-bottom:24px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:0.2px;margin-bottom:6px;">Stock Opname Report</div>
      <div style="font-size:12px;color:#333;">Generated at: ${escapeHtml(fmtTimestamp(report.generatedAt))}</div>
      <div style="font-size:12px;color:#333;">Period: ${escapeHtml(report.filters.startDate)} &rarr; ${escapeHtml(report.filters.endDate)}</div>
    </div>

    ${noDataSection}
    ${locationSections}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF generator — uses Puppeteer to convert HTML → PDF buffer
// ---------------------------------------------------------------------------
export async function generateStockOpnamePDF(report: StockOpnameReport): Promise<Buffer> {
  const html = generateStockOpnameHTML(report);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '10mm',
        right: '10mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

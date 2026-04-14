import { useMemo } from 'react';
import { StockOpnameReport } from '../services/report.service';
import StockOpnameTable from './StockOpnameTable';

interface Props {
  report: StockOpnameReport;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function StockOpnamePreview({ report }: Props) {
  // Sort: locations by name, categories by name, items by SKU
  const sortedLocations = useMemo(() => {
    return [...report.locations]
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
  }, [report]);

  const hasAnyItems = sortedLocations.some((loc) =>
    loc.categories.some((cat) => cat.items.length > 0),
  );

  return (
    <div
      style={{
        backgroundColor: '#fff',
        color: '#000',
        padding: '32px 36px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {/* Report header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 0.2,
            marginBottom: 6,
          }}
        >
          Stock Opname Report
        </div>
        <div style={{ fontSize: 12, color: '#333' }}>
          Generated at: {formatTimestamp(report.generatedAt)}
        </div>
        <div style={{ fontSize: 12, color: '#333' }}>
          Period: {report.filters.startDate} → {report.filters.endDate}
        </div>
      </div>

      {!hasAnyItems && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 0',
            fontSize: 13,
            color: '#666',
            border: '1px dashed #ccc',
          }}
        >
          No data available for selected filters
        </div>
      )}

      {sortedLocations.map((loc) => {
        const locHasItems = loc.categories.some((c) => c.items.length > 0);
        if (!locHasItems) return null;

        return (
          <section key={loc.locationId} className="location-section" style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 700,
                margin: '0 0 12px 0',
                paddingBottom: 4,
                borderBottom: '2px solid #000',
              }}
            >
              Location: {loc.locationName}{' '}
              <span style={{ fontWeight: 400, color: '#555' }}>
                ({loc.locationCode})
              </span>
            </h2>

            {loc.categories.map((cat) => {
              if (cat.items.length === 0) return null;
              return (
                <div key={cat.categoryId} style={{ marginBottom: 20 }}>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      margin: '0 0 6px 0',
                      color: '#222',
                    }}
                  >
                    Category: {cat.categoryName}
                  </h3>
                  <StockOpnameTable items={cat.items} />
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

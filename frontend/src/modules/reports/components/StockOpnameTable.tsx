import { StockOpnameItem } from '../services/report.service';

interface Props {
  items: StockOpnameItem[];
}

function fmtQty(n: number | null): string {
  if (n === null || n === undefined) return '';
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1.5px solid #000',
  borderTop: '1.5px solid #000',
  fontWeight: 700,
  fontSize: 12,
  backgroundColor: '#fafafa',
  whiteSpace: 'nowrap',
};

const thRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #e0e0e0',
  fontSize: 12,
  height: 28,
};

const tdRight: React.CSSProperties = { ...tdStyle, textAlign: 'right' };

export default function StockOpnameTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#666', padding: '8px 10px' }}>
        No items in this category
      </div>
    );
  }

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'auto',
      }}
    >
      <thead>
        <tr>
          <th style={thStyle}>SKU</th>
          <th style={thStyle}>Name</th>
          <th style={thRight}>Starting Qty</th>
          <th style={thRight}>Inbound Qty</th>
          <th style={thRight}>Outbound Qty</th>
          <th style={thRight}>System Qty</th>
          <th style={thRight}>Physical Qty</th>
          <th style={thRight}>Variance</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.productId}>
            <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{it.sku}</td>
            <td style={tdStyle}>{it.productName}</td>
            <td style={tdRight}>{fmtQty(it.startingQty)}</td>
            <td style={tdRight}>{fmtQty(it.inboundQty)}</td>
            <td style={tdRight}>{fmtQty(it.outboundQty)}</td>
            <td style={tdRight}>{fmtQty(it.systemQty)}</td>
            <td style={tdRight}>{fmtQty(it.physicalQty)}</td>
            <td style={tdRight}>{fmtQty(it.variance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

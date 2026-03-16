import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, FormControl, InputLabel, MenuItem, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, Paper, Snackbar,
  TablePagination, Tooltip,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useQuery } from '@tanstack/react-query';
import stockService, { StockOverviewItem, StockLedgerEntry } from '../../../services/stock.service';
import { useAuth } from '../../../context/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtQty(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function sourceTypeChip(t: StockLedgerEntry['sourceType']) {
  const map: Record<string, { label: string; color: 'success' | 'info' | 'error' | 'default' }> = {
    SEED:         { label: 'Seed',       color: 'default'  },
    ADJUSTMENT:   { label: 'Adjustment', color: 'info'     },
    MOVEMENT_IN:  { label: 'In',         color: 'success'  },
    MOVEMENT_OUT: { label: 'Out',        color: 'error'    },
  };
  const cfg = map[t] ?? { label: t, color: 'default' };
  return <Chip label={cfg.label} color={cfg.color} size="small" />;
}

// ---------------------------------------------------------------------------
// Ledger Modal
// ---------------------------------------------------------------------------
type LedgerModalProps = {
  open: boolean;
  onClose: () => void;
  productId: string;
  locationId: string;
  productSku: string;
  locationCode: string;
};

function LedgerModal({ open, onClose, productId, locationId, productSku, locationCode }: LedgerModalProps) {
  const [page, setPage]   = useState(0);
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-ledger', productId, locationId, page],
    queryFn:  () => stockService.getLedger({ productId, locationId, page: page + 1, limit }),
    enabled:  open,
  });

  const entries  = data?.data ?? [];
  const total    = data?.meta?.total ?? 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Stock Ledger — {productSku} @ {locationCode}
      </DialogTitle>
      <DialogContent>
        {isLoading && <CircularProgress size={24} />}
        {error    && <Alert severity="error">Failed to load ledger</Alert>}
        {!isLoading && !error && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Change</TableCell>
                    <TableCell align="right">Balance After</TableCell>
                    <TableCell>Source ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{sourceTypeChip(e.sourceType)}</TableCell>
                      <TableCell align="right" sx={{ color: Number(e.changeQty) >= 0 ? 'success.main' : 'error.main' }}>
                        {Number(e.changeQty) >= 0 ? '+' : ''}{fmtQty(Number(e.changeQty))}
                      </TableCell>
                      <TableCell align="right">{fmtQty(Number(e.balanceAfter))}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                        <Tooltip title={e.sourceId}><span>{e.sourceId.slice(0, 12)}…</span></Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">No ledger entries</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={limit}
              rowsPerPageOptions={[limit]}
              onPageChange={(_, p) => setPage(p)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Stock Dashboard Page
// ---------------------------------------------------------------------------
export default function StockDashboardPage() {
  const { isAdmin } = useAuth();

  // Filters
  const [filterLocationId, setFilterLocationId] = useState('');
  const [filterStartDate,  setFilterStartDate]  = useState('');
  const [filterEndDate,    setFilterEndDate]     = useState('');
  const [page, setPage]     = useState(0);
  const [limit]             = useState(20);

  // Applied filters (submit on click)
  const [appliedFilters, setAppliedFilters] = useState<{
    locationId?: string; startDate?: string; endDate?: string;
  }>({});

  // Ledger modal state
  const [ledgerTarget, setLedgerTarget] = useState<StockOverviewItem | null>(null);

  // Snackbar
  const [snackMsg, setSnackMsg] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-overview', appliedFilters, page, limit],
    queryFn:  () => stockService.getStockOverview({
      ...appliedFilters,
      page:  page + 1,
      limit,
    }),
  });

  const rows  = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  function applyFilters() {
    setPage(0);
    setAppliedFilters({
      locationId: filterLocationId || undefined,
      startDate:  filterStartDate  ? new Date(filterStartDate).toISOString()  : undefined,
      endDate:    filterEndDate    ? new Date(filterEndDate).toISOString()    : undefined,
    });
  }

  function clearFilters() {
    setFilterLocationId('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(0);
    setAppliedFilters({});
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Stock Dashboard</Typography>
        <Button startIcon={<RefreshIcon />} onClick={() => { refetch(); setSnackMsg('Refreshed'); }}>
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {isAdmin && (
            <TextField
              label="Location ID"
              size="small"
              value={filterLocationId}
              onChange={(e) => setFilterLocationId(e.target.value)}
              placeholder="UUID or leave blank for all"
              sx={{ minWidth: 260 }}
            />
          )}
          <TextField
            label="Period Start"
            type="datetime-local"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
          <TextField
            label="Period End"
            type="datetime-local"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
          <Button variant="contained" startIcon={<FilterListIcon />} onClick={applyFilters}>
            Apply
          </Button>
          <Button variant="outlined" onClick={clearFilters}>
            Clear
          </Button>
        </Box>
      </Paper>

      {/* Table */}
      {isLoading && <CircularProgress />}
      {error     && <Alert severity="error">Failed to load stock data</Alert>}

      {!isLoading && !error && (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell>UOM</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell align="right">On Hand</TableCell>
                  <TableCell align="right">Reserved</TableCell>
                  <TableCell align="right">Available</TableCell>
                  {(appliedFilters.startDate || appliedFilters.endDate) && (
                    <>
                      <TableCell align="right">Starting</TableCell>
                      <TableCell align="right">Inbound</TableCell>
                      <TableCell align="right">Outbound</TableCell>
                      <TableCell align="right">Final Qty</TableCell>
                    </>
                  )}
                  <TableCell align="center">Ledger</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.productId}-${row.locationId}`} hover>
                    <TableCell><strong>{row.productSku}</strong></TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.uomCode}</TableCell>
                    <TableCell>
                      <Chip label={row.locationCode} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{fmtQty(row.onHandQty)}</TableCell>
                    <TableCell align="right" sx={{ color: row.reservedQty > 0 ? 'warning.main' : 'inherit' }}>
                      {fmtQty(row.reservedQty)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: row.availableQty <= 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
                      {fmtQty(row.availableQty)}
                    </TableCell>
                    {(appliedFilters.startDate || appliedFilters.endDate) && (
                      <>
                        <TableCell align="right">{fmtQty(row.startingQty)}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{fmtQty(row.inboundQty)}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>{fmtQty(row.outboundQty)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtQty(row.finalQty)}</TableCell>
                      </>
                    )}
                    <TableCell align="center">
                      <Button
                        size="small"
                        startIcon={<HistoryIcon />}
                        onClick={() => setLedgerTarget(row)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} align="center">
                      No stock records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={limit}
            rowsPerPageOptions={[20]}
            onPageChange={(_, p) => setPage(p)}
          />
        </>
      )}

      {/* Ledger Modal */}
      {ledgerTarget && (
        <LedgerModal
          open={!!ledgerTarget}
          onClose={() => setLedgerTarget(null)}
          productId={ledgerTarget.productId}
          locationId={ledgerTarget.locationId}
          productSku={ledgerTarget.productSku}
          locationCode={ledgerTarget.locationCode}
        />
      )}

      {/* Success snackbar */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Box>
  );
}

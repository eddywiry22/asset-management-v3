import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, MenuItem, Select, FormControl, InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, Paper, Snackbar,
  TablePagination, Tooltip,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useQuery } from '@tanstack/react-query';
import stockService, { StockOverviewItem, StockLedgerEntry } from '../../../services/stock.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtQty(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function sourceTypeChip(t: StockLedgerEntry['sourceType']) {
  const map: Record<string, { label: string; color: 'success' | 'info' | 'error' | 'default' }> = {
    SEED:         { label: 'Seed',        color: 'default'  },
    ADJUSTMENT:   { label: 'Adjustment',  color: 'info'     },
    MOVEMENT_IN:  { label: 'In',          color: 'success'  },
    MOVEMENT_OUT: { label: 'Out',         color: 'error'    },
    TRANSFER_IN:  { label: 'Transfer In', color: 'success'  },
    TRANSFER_OUT: { label: 'Transfer Out', color: 'error'   },
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
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-ledger', productId, locationId, page],
    queryFn:  () => stockService.getLedger({ productId, locationId, page: page + 1, limit }),
    enabled:  open,
  });

  const entries = data?.data ?? [];
  const total   = data?.meta?.total ?? 0;

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
  // Filters
  const [filterLocationId, setFilterLocationId] = useState('');
  const [filterStartDate,  setFilterStartDate]  = useState('');
  const [filterEndDate,    setFilterEndDate]     = useState('');
  const [page, setPage]  = useState(0);
  const [limit]          = useState(20);

  // Applied filters (submitted on click)
  const [appliedFilters, setAppliedFilters] = useState<{
    locationId?: string; startDate?: string; endDate?: string;
  }>({});
  const [applyVersion, setApplyVersion] = useState(0);

  // Ledger modal state
  const [ledgerTarget, setLedgerTarget] = useState<StockOverviewItem | null>(null);

  // Snackbar
  const [snackMsg, setSnackMsg] = useState('');

  // Fetch locations visible to this user (drives the location filter dropdown)
  const { data: visibleLocations = [] } = useQuery({
    queryKey: ['stock-visible-locations'],
    queryFn:  stockService.getVisibleLocations,
  });

  const showLocationFilter = visibleLocations.length > 1;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-overview', appliedFilters, page, limit, applyVersion],
    queryFn:  () => {
      const { locationId, startDate, endDate } = appliedFilters;
      console.log('APPLIED FILTERS', appliedFilters);
      console.log('FETCH', { startDate, endDate, locationId, applyVersion });
      return stockService.getStockOverview({ ...appliedFilters, page: page + 1, limit });
    },
    // staleTime: 0 ensures a fresh fetch every time the queryKey changes (e.g. new date filter)
    // regardless of the global 30 s default set in App.tsx
    staleTime: 0,
  });

  const rows  = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  function applyFilters() {
    setPage(0);
    let endDateIso: string | undefined;
    if (filterEndDate) {
      const d = new Date(filterEndDate);
      d.setHours(23, 59, 59, 999);
      endDateIso = d.toISOString();
    }
    setAppliedFilters({
      locationId: filterLocationId || undefined,
      startDate:  filterStartDate ? new Date(filterStartDate).toISOString() : undefined,
      endDate:    endDateIso,
    });
    setApplyVersion((v) => v + 1);
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
          {/* Location filter — visible when the user has access to more than one location */}
          {showLocationFilter && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Location</InputLabel>
              <Select
                value={filterLocationId}
                label="Location"
                onChange={(e) => setFilterLocationId(e.target.value)}
              >
                <MenuItem value=""><em>All locations</em></MenuItem>
                {visibleLocations.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>
                    {loc.code} — {loc.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
                  {/* Period columns are ALWAYS rendered; values are current state when no filter */}
                  <TableCell align="right">Starting</TableCell>
                  <TableCell align="right">Inbound</TableCell>
                  <TableCell align="right">Outbound</TableCell>
                  <TableCell align="right">Final Qty</TableCell>
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
                    <TableCell align="right">{fmtQty(row.startingQty)}</TableCell>
                    <TableCell align="right" sx={{ color: row.inboundQty > 0 ? 'success.main' : 'inherit' }}>
                      {fmtQty(row.inboundQty)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: row.outboundQty > 0 ? 'error.main' : 'inherit' }}>
                      {fmtQty(row.outboundQty)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {fmtQty(row.finalQty)}
                    </TableCell>
                    <TableCell align="center">
                      <Button size="small" startIcon={<HistoryIcon />} onClick={() => setLedgerTarget(row)}>
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

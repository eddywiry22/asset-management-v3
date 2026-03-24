import { useState, useMemo } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select,
  Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, Paper, Snackbar,
  TablePagination, Tooltip,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useQuery } from '@tanstack/react-query';
import stockService, { StockOverviewItem, StockLedgerEntry } from '../../../services/stock.service';
import { useAuth } from '../../../context/AuthContext';
import AdvancedFilterModal from '../../../components/AdvancedFilterModal';
import FilterSummaryChips from '../../../components/FilterSummaryChips';
import { useAdvancedFilters } from '../../../hooks/useAdvancedFilters';
import { goodsService } from '../../../services/goods.service';

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
  const { isAdmin } = useAuth();

  // Product/location filters via reusable hook
  const {
    filters,
    applyProductFilter,
    applyLocationFilter,
    applyAdvancedFilters,
    clearFilters,
    activeCount,
  } = useAdvancedFilters();

  // Simple filter local UI state
  const [filterProductId, setFilterProductId] = useState('');
  const [filterLocationId, setFilterLocationId] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // Date filters (staging + applied); default staging to today
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string | null>(today);
  const [endDate,   setEndDate]   = useState<string | null>(today);
  const [appliedStartDate, setAppliedStartDate] = useState<string | undefined>(undefined);
  const [appliedEndDate,   setAppliedEndDate]   = useState<string | undefined>(undefined);

  const [page, setPage] = useState(0);
  const [limit]         = useState(20);

  // Ledger modal state
  const [ledgerTarget, setLedgerTarget] = useState<StockOverviewItem | null>(null);

  // Snackbar
  const [snackMsg, setSnackMsg] = useState('');

  // Fetch products for simple filter dropdown
  const { data: products = [] } = useQuery({
    queryKey: ['goods'],
    queryFn: goodsService.getAll,
  });

  // Fetch locations visible to this user
  const { data: visibleLocations = [], isSuccess: locationsLoaded } = useQuery({
    queryKey: ['stock-visible-locations'],
    queryFn:  stockService.getVisibleLocations,
  });

  const hasNoLocation = !isAdmin && locationsLoaded && visibleLocations.length === 0;

  // Lookup maps for FilterSummaryChips
  const productsMap = useMemo(() => {
    const map: Record<string, string> = {};
    products.forEach(p => { map[p.id] = p.name; });
    return map;
  }, [products]);

  const locationsMap = useMemo(() => {
    const map: Record<string, string> = {};
    visibleLocations.forEach(l => { map[l.id] = l.name; });
    return map;
  }, [visibleLocations]);

  // Normalized filter arrays
  const productIds  = filters.productIds  ?? [];
  const locationIds = filters.locationIds ?? [];

  const handleRemoveProduct = (id: string) => {
    applyProductFilter(productIds.filter(p => p !== id));
  };

  const handleRemoveLocation = (id: string) => {
    applyLocationFilter(locationIds.filter(l => l !== id));
  };

  const queryParams = {
    page: page + 1,
    limit,
    startDate: appliedStartDate,
    endDate:   appliedEndDate,
    ...(filters.productIds  && { productIds:  filters.productIds }),
    ...(filters.locationIds && { locationIds: filters.locationIds }),
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-overview', filters, appliedStartDate, appliedEndDate, page, limit],
    queryFn:  () => stockService.getStockOverview(queryParams),
    staleTime: 0,
  });

  const rows  = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const isDateRangeInvalid = !!(startDate && endDate && startDate > endDate);

  const handleApplySimple = () => {
    applyProductFilter(filterProductId   ? [filterProductId]   : undefined);
    applyLocationFilter(filterLocationId ? [filterLocationId] : undefined);
    setPage(0);
  };

  function applyDateFilters() {
    if (isDateRangeInvalid) return;
    setAppliedStartDate(startDate ?? undefined);
    setAppliedEndDate(endDate ?? undefined);
    setPage(0);
  }

  function handleClearDate() {
    setStartDate(today);
    setEndDate(today);
    setAppliedStartDate(undefined);
    setAppliedEndDate(undefined);
    setPage(0);
  }

  function handleClearAll() {
    clearFilters();
    setFilterProductId('');
    setFilterLocationId('');
    handleClearDate();
  }

  return (
    <Box>
      {hasNoLocation && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You are not assigned to any location. Contact admin.
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Stock Dashboard</Typography>
        <Button startIcon={<RefreshIcon />} onClick={() => { refetch(); setSnackMsg('Refreshed'); }}>
          Refresh
        </Button>
      </Box>

      {/* Simple Filters */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Product</InputLabel>
          <Select
            value={filterProductId}
            label="Product"
            onChange={(e) => setFilterProductId(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {products.map(p => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Location</InputLabel>
          <Select
            value={filterLocationId}
            label="Location"
            onChange={(e) => setFilterLocationId(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {visibleLocations.map(l => (
              <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button variant="outlined" onClick={handleApplySimple}>
          Apply
        </Button>

        <Button variant="text" onClick={handleClearAll}>
          Clear
        </Button>

        <Button
          variant="contained"
          startIcon={<FilterListIcon />}
          onClick={() => setFilterModalOpen(true)}
        >
          Advanced Filter{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </Paper>

      {/* Date Range Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="Period Start"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={startDate ?? ''}
            onChange={(e) => setStartDate(e.target.value || null)}
            error={isDateRangeInvalid}
          />
          <TextField
            label="Period End"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={endDate ?? ''}
            onChange={(e) => setEndDate(e.target.value || null)}
            error={isDateRangeInvalid}
            helperText={isDateRangeInvalid ? 'End date must be after start date' : undefined}
          />
          <Button variant="outlined" onClick={applyDateFilters} disabled={isDateRangeInvalid}>
            Apply Dates
          </Button>
          <Tooltip title="Reset to today's date">
            <span>
              <Button
                variant="text"
                onClick={handleClearDate}
                disabled={startDate === today && endDate === today}
              >
                Reset Dates
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Paper>

      <AdvancedFilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        initialFilters={{
          productIds:  filters.productIds,
          locationIds: filters.locationIds,
        }}
        onApply={(data) => {
          applyAdvancedFilters(data);
          setPage(0);
        }}
      />

      {/* Filter Summary Chips */}
      <FilterSummaryChips
        productIds={productIds}
        locationIds={locationIds}
        startDate={appliedStartDate}
        endDate={appliedEndDate}
        productsMap={productsMap}
        locationsMap={locationsMap}
        onRemoveProduct={handleRemoveProduct}
        onRemoveLocation={handleRemoveLocation}
        onClearDates={handleClearDate}
        onClearAll={handleClearAll}
      />

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
                  <TableCell>Location Status</TableCell>
                  <TableCell>Product Status</TableCell>
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
                    <TableCell>
                      {row.locationIsActive ? (
                        <Chip label="Active" size="small" color="success" />
                      ) : (
                        <Tooltip title="This location is inactive. Stock is read-only.">
                          <Chip label="Inactive" size="small" color="default" />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.isInactiveNow ? (
                        <Tooltip title="This product's registration at this location is currently inactive">
                          <Chip label="Inactive" size="small" color="warning" />
                        </Tooltip>
                      ) : !row.isRegisteredNow ? (
                        <Tooltip title="This product is inactive at this location">
                          <Chip label="Inactive" size="small" color="warning" />
                        </Tooltip>
                      ) : (
                        <Tooltip title="This product is actively registered at this location">
                          <Chip label="Active" size="small" color="success" />
                        </Tooltip>
                      )}
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
                    <TableCell colSpan={14} align="center">
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

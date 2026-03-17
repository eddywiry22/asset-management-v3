import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, MenuItem, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, Paper, Snackbar,
  TablePagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import stockAdjustmentsService, {
  AdjustmentRequest,
  AdjustmentRequestStatus,
} from '../../../services/stockAdjustments.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<AdjustmentRequestStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  DRAFT:     'default',
  SUBMITTED: 'warning',
  APPROVED:  'info',
  REJECTED:  'error',
  FINALIZED: 'success',
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function userLabel(u: { email: string | null; phone: string | null } | null | undefined): string {
  if (!u) return '—';
  return u.email ?? u.phone ?? u.email ?? '(unknown)';
}

// ---------------------------------------------------------------------------
// Create Request Dialog
// ---------------------------------------------------------------------------
function CreateRequestDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Adjustment Request</DialogTitle>
      <DialogContent>
        <TextField
          label="Notes (optional)"
          fullWidth
          multiline
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { onCreate(notes); setNotes(''); }}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function StockAdjustmentsPage() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  const [page, setPage]             = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<AdjustmentRequestStatus | ''>('');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ status: '' as AdjustmentRequestStatus | '', startDate: '', endDate: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [snack, setSnack]           = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-adjustments', appliedFilters, page, rowsPerPage],
    queryFn:  () => stockAdjustmentsService.getAll({
      ...(appliedFilters.status    ? { status:    appliedFilters.status    } : {}),
      ...(appliedFilters.startDate ? { startDate: appliedFilters.startDate } : {}),
      ...(appliedFilters.endDate   ? { endDate:   appliedFilters.endDate   } : {}),
      page:  page + 1,
      limit: rowsPerPage,
    }),
  });

  const createMutation = useMutation({
    mutationFn: (notes: string) => stockAdjustmentsService.create({ notes: notes || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      setCreateOpen(false);
      setSnack({ msg: `Created ${res.data.requestNumber}`, severity: 'success' });
      navigate(`/stock-adjustments/${res.data.id}`);
    },
    onError: () => setSnack({ msg: 'Failed to create request', severity: 'error' }),
  });

  const rows   = data?.data  ?? [];
  const total  = data?.meta?.total ?? 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>Stock Adjustment Requests</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New Request
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AdjustmentRequestStatus | '')}
            >
              <MenuItem value="">All</MenuItem>
              {(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FINALIZED'] as AdjustmentRequestStatus[]).map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="From"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => { setPage(0); setAppliedFilters({ status: statusFilter, startDate, endDate }); }}
          >
            Apply
          </Button>
          <Button
            variant="text"
            onClick={() => {
              setStatusFilter(''); setStartDate(''); setEndDate('');
              setPage(0);
              setAppliedFilters({ status: '', startDate: '', endDate: '' });
            }}
          >
            Clear
          </Button>
        </Box>
      </Paper>

      {/* Table */}
      {isLoading && <CircularProgress />}
      {error    && <Alert severity="error">Failed to load requests</Alert>}
      {!isLoading && !error && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Request #</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created By</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>Approved At</TableCell>
                  <TableCell>Finalized At</TableCell>
                  <TableCell align="center">Items</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No requests found.</TableCell>
                  </TableRow>
                )}
                {rows.map((r: AdjustmentRequest) => (
                  <TableRow
                    key={r.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/stock-adjustments/${r.id}`)}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>{r.requestNumber}</TableCell>
                    <TableCell>
                      <Chip label={r.status} color={STATUS_COLORS[r.status]} size="small" />
                    </TableCell>
                    <TableCell>{userLabel(r.createdBy)}</TableCell>
                    <TableCell>{fmtDate(r.createdAt)}</TableCell>
                    <TableCell>{fmtDate(r.approvedAt)}</TableCell>
                    <TableCell>{fmtDate(r.finalizedAt)}</TableCell>
                    <TableCell align="center">{r.items?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}

      {/* Create dialog */}
      <CreateRequestDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(notes) => createMutation.mutate(notes)}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity ?? 'info'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

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
import stockTransfersService, {
  TransferRequest,
  TransferRequestStatus,
  CreateTransferPayload,
} from '../../../services/stockTransfers.service';
import stockService from '../../../services/stock.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<TransferRequestStatus, 'default' | 'success'> = {
  DRAFT:     'default',
  FINALIZED: 'success',
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function userLabel(u: { email: string | null; phone: string | null } | null | undefined): string {
  if (!u) return '—';
  return u.email ?? u.phone ?? '(unknown)';
}

type SimpleLocation = { id: string; code: string; name: string };

// ---------------------------------------------------------------------------
// Create Transfer Dialog
// ---------------------------------------------------------------------------
function CreateTransferDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateTransferPayload) => void;
}) {
  const [sourceLocationId,      setSourceLocationId]      = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [notes, setNotes] = useState('');

  const { data: locationsRes } = useQuery({
    queryKey: ['locations-simple'],
    queryFn:  () => stockService.getVisibleLocations(),
    enabled:  open,
  });
  const locations: SimpleLocation[] = locationsRes ?? [];

  const handleCreate = () => {
    if (!sourceLocationId || !destinationLocationId) return;
    onCreate({ sourceLocationId, destinationLocationId, notes: notes || undefined });
    setSourceLocationId('');
    setDestinationLocationId('');
    setNotes('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Stock Transfer</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Source Location</InputLabel>
            <Select
              label="Source Location"
              value={sourceLocationId}
              onChange={(e) => setSourceLocationId(e.target.value)}
            >
              {locations.map((l: SimpleLocation) => (
                <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Destination Location</InputLabel>
            <Select
              label="Destination Location"
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
            >
              {locations
                .filter((l) => l.id !== sourceLocationId)
                .map((l: SimpleLocation) => (
                  <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
                ))}
            </Select>
          </FormControl>
          <TextField
            label="Notes (optional)"
            fullWidth
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId}
          onClick={handleCreate}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function StockTransfersPage() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<TransferRequestStatus | ''>('');
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ status: '' as TransferRequestStatus | '', startDate: '', endDate: '' });
  const [createOpen, setCreateOpen]   = useState(false);
  const [snack, setSnack]             = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-transfers', appliedFilters, page, rowsPerPage],
    queryFn:  () => stockTransfersService.getAll({
      ...(appliedFilters.status    ? { status:    appliedFilters.status    } : {}),
      ...(appliedFilters.startDate ? { startDate: appliedFilters.startDate } : {}),
      ...(appliedFilters.endDate   ? { endDate:   appliedFilters.endDate   } : {}),
      page:  page + 1,
      limit: rowsPerPage,
    }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateTransferPayload) => stockTransfersService.create(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      setCreateOpen(false);
      setSnack({ msg: `Created ${res.data.requestNumber}`, severity: 'success' });
      navigate(`/stock-transfers/${res.data.id}`);
    },
    onError: (e: any) =>
      setSnack({ msg: e?.response?.data?.error?.message ?? 'Failed to create transfer', severity: 'error' }),
  });

  const rows  = data?.data  ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>Stock Transfers</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New Transfer
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
              onChange={(e) => setStatusFilter(e.target.value as TransferRequestStatus | '')}
            >
              <MenuItem value="">All</MenuItem>
              {(['DRAFT', 'FINALIZED'] as TransferRequestStatus[]).map((s) => (
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
      {error    && <Alert severity="error">Failed to load transfers</Alert>}
      {!isLoading && !error && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Request #</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Destination</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created By</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>Finalized At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No transfers found.</TableCell>
                  </TableRow>
                )}
                {rows.map((r: TransferRequest) => (
                  <TableRow
                    key={r.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/stock-transfers/${r.id}`)}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>{r.requestNumber}</TableCell>
                    <TableCell>{r.sourceLocation?.code} — {r.sourceLocation?.name}</TableCell>
                    <TableCell>{r.destinationLocation?.code} — {r.destinationLocation?.name}</TableCell>
                    <TableCell>
                      <Chip label={r.status} color={STATUS_COLORS[r.status]} size="small" />
                    </TableCell>
                    <TableCell>{userLabel(r.createdBy)}</TableCell>
                    <TableCell>{fmtDate(r.createdAt)}</TableCell>
                    <TableCell>{fmtDate(r.finalizedAt)}</TableCell>
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
      <CreateTransferDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(payload) => createMutation.mutate(payload)}
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

import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, IconButton, InputLabel, MenuItem, Select,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, Paper, Snackbar, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import stockAdjustmentsService, {
  AdjustmentItem,
  AdjustmentRequest,
  AddItemPayload,
} from '../../../services/stockAdjustments.service';
import stockService from '../../../services/stock.service';
import apiClient from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
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
  return u.email ?? u.phone ?? '(unknown)';
}

// ---------------------------------------------------------------------------
// Product selector type
// ---------------------------------------------------------------------------
type SimpleProduct = { id: string; sku: string; name: string };
type SimpleLocation = { id: string; code: string; name: string };

// ---------------------------------------------------------------------------
// Add/Edit Item Dialog
// ---------------------------------------------------------------------------
function ItemDialog({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: AddItemPayload) => void;
  initial?: AdjustmentItem | null;
}) {
  const [productId,  setProductId]  = useState(initial?.productId  ?? '');
  const [locationId, setLocationId] = useState(initial?.locationId ?? '');
  const [qtyChange,  setQtyChange]  = useState(initial ? String(initial.qtyChange) : '');
  const [reason,     setReason]     = useState(initial?.reason ?? '');

  const { data: productsRes } = useQuery({
    queryKey: ['products-simple'],
    queryFn:  () => apiClient.get('products?limit=200').then((r) => r.data),
    enabled:  open,
  });

  const { data: locationsRes } = useQuery({
    queryKey: ['locations-simple'],
    queryFn:  () => stockService.getVisibleLocations(),
    enabled:  open,
  });

  const products: SimpleProduct[]  = productsRes?.data  ?? [];
  const locations: SimpleLocation[] = locationsRes ?? [];

  const handleSave = () => {
    const qty = parseFloat(qtyChange);
    if (!productId || !locationId || isNaN(qty) || qty === 0) return;
    onSave({ productId, locationId, qtyChange: qty, reason: reason || undefined });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Item' : 'Add Item'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Product</InputLabel>
            <Select label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p: SimpleProduct) => (
                <MenuItem key={p.id} value={p.id}>{p.sku} — {p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Location</InputLabel>
            <Select label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l: SimpleLocation) => (
                <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Qty Change (negative = decrease)"
            type="number"
            size="small"
            value={qtyChange}
            onChange={(e) => setQtyChange(e.target.value)}
            helperText="Use negative value to decrease stock"
          />
          <TextField
            label="Reason (optional)"
            size="small"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          {initial ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Detail Page
// ---------------------------------------------------------------------------
export default function StockAdjustmentDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { isAdmin } = useAuth();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem,    setEditingItem]    = useState<AdjustmentItem | null>(null);
  const [confirmAction,  setConfirmAction]  = useState<'submit' | 'approve' | 'reject' | 'finalize' | null>(null);
  const [rejectNotes,    setRejectNotes]    = useState('');
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const { data: reqData, isLoading, error } = useQuery({
    queryKey: ['stock-adjustment', id],
    queryFn:  () => stockAdjustmentsService.getById(id!),
    enabled:  !!id,
  });

  const req: AdjustmentRequest | undefined = reqData?.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-adjustment', id] });
    queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
  };

  const addItemMutation = useMutation({
    mutationFn: (payload: AddItemPayload) => stockAdjustmentsService.addItem(id!, payload),
    onSuccess: () => { invalidate(); setItemDialogOpen(false); setSnack({ msg: 'Item added', severity: 'success' }); },
    onError: () => setSnack({ msg: 'Failed to add item', severity: 'error' }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: AddItemPayload }) =>
      stockAdjustmentsService.updateItem(id!, itemId, payload),
    onSuccess: () => { invalidate(); setItemDialogOpen(false); setEditingItem(null); setSnack({ msg: 'Item updated', severity: 'success' }); },
    onError: () => setSnack({ msg: 'Failed to update item', severity: 'error' }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => stockAdjustmentsService.deleteItem(id!, itemId),
    onSuccess: () => { invalidate(); setSnack({ msg: 'Item removed', severity: 'success' }); },
    onError: () => setSnack({ msg: 'Failed to remove item', severity: 'error' }),
  });

  const submitMutation = useMutation({
    mutationFn: () => stockAdjustmentsService.submit(id!),
    onSuccess: () => { invalidate(); setConfirmAction(null); setSnack({ msg: 'Submitted successfully', severity: 'success' }); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Submit failed', severity: 'error' }); },
  });

  const approveMutation = useMutation({
    mutationFn: () => stockAdjustmentsService.approve(id!),
    onSuccess: () => { invalidate(); setConfirmAction(null); setSnack({ msg: 'Approved', severity: 'success' }); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Approve failed', severity: 'error' }); },
  });

  const rejectMutation = useMutation({
    mutationFn: () => stockAdjustmentsService.reject(id!, rejectNotes || undefined),
    onSuccess: () => { invalidate(); setConfirmAction(null); setRejectNotes(''); setSnack({ msg: 'Rejected', severity: 'success' }); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Reject failed', severity: 'error' }); },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => stockAdjustmentsService.finalize(id!),
    onSuccess: () => { invalidate(); setConfirmAction(null); setSnack({ msg: 'Finalized — stock updated', severity: 'success' }); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Finalize failed', severity: 'error' }); },
  });

  const isDraft     = req?.status === 'DRAFT';
  const isSubmitted = req?.status === 'SUBMITTED';
  const isApproved  = req?.status === 'APPROVED';

  if (isLoading) return <CircularProgress />;
  if (error || !req) return <Alert severity="error">Failed to load request</Alert>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/stock-adjustments')}>Back</Button>
        <Typography variant="h5" fontWeight={600} sx={{ flexGrow: 1 }}>
          {req.requestNumber}
        </Typography>
        <Chip label={req.status} color={STATUS_COLORS[req.status] ?? 'default'} />
      </Box>

      {/* Meta */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Created By</Typography>
            <Typography>{userLabel(req.createdBy)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Created At</Typography>
            <Typography>{fmtDate(req.createdAt)}</Typography>
          </Box>
          {req.approvedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Approved By / At</Typography>
              <Typography>{userLabel(req.approvedBy)} — {fmtDate(req.approvedAt)}</Typography>
            </Box>
          )}
          {req.finalizedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Finalized By / At</Typography>
              <Typography>{userLabel(req.finalizedBy)} — {fmtDate(req.finalizedAt)}</Typography>
            </Box>
          )}
          {req.notes && (
            <Box sx={{ flexBasis: '100%' }}>
              <Typography variant="caption" color="text.secondary">Notes</Typography>
              <Typography>{req.notes}</Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Items */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Items</Typography>
        {isDraft && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}
          >
            Add Item
          </Button>
        )}
      </Box>

      <Paper sx={{ mb: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product (SKU)</TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="right">Qty Change</TableCell>
                <TableCell>Reason</TableCell>
                {isDraft && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {req.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">No items yet.</TableCell>
                </TableRow>
              )}
              {req.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product?.sku} — {item.product?.name}</TableCell>
                  <TableCell>{item.location?.code} — {item.location?.name}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: Number(item.qtyChange) >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
                  >
                    {Number(item.qtyChange) >= 0 ? '+' : ''}{Number(item.qtyChange)}
                  </TableCell>
                  <TableCell>{item.reason ?? '—'}</TableCell>
                  {isDraft && (
                    <TableCell align="center">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => { setEditingItem(item); setItemDialogOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => deleteItemMutation.mutate(item.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Workflow Actions */}
      <Divider sx={{ mb: 2 }} />
      <Box sx={{ display: 'flex', gap: 2 }}>
        {isDraft && (
          <Button variant="contained" color="primary" onClick={() => setConfirmAction('submit')}>
            Submit for Approval
          </Button>
        )}
        {isSubmitted && isAdmin && (
          <>
            <Button variant="contained" color="success" onClick={() => setConfirmAction('approve')}>
              Approve
            </Button>
            <Button variant="outlined" color="error" onClick={() => setConfirmAction('reject')}>
              Reject
            </Button>
          </>
        )}
        {isApproved && (
          <Button variant="contained" color="warning" onClick={() => setConfirmAction('finalize')}>
            Finalize (Apply Stock Changes)
          </Button>
        )}
      </Box>

      {/* Add/Edit Item Dialog */}
      <ItemDialog
        key={editingItem?.id ?? 'new'}
        open={itemDialogOpen}
        onClose={() => { setItemDialogOpen(false); setEditingItem(null); }}
        onSave={(payload) => {
          if (editingItem) {
            updateItemMutation.mutate({ itemId: editingItem.id, payload });
          } else {
            addItemMutation.mutate(payload);
          }
        }}
        initial={editingItem}
      />

      {/* Confirm Action Dialog */}
      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirmAction === 'submit'   && 'Submit Request'}
          {confirmAction === 'approve'  && 'Approve Request'}
          {confirmAction === 'reject'   && 'Reject Request'}
          {confirmAction === 'finalize' && 'Finalize Request'}
        </DialogTitle>
        <DialogContent>
          {confirmAction === 'reject' && (
            <TextField
              label="Rejection notes (optional)"
              fullWidth
              multiline
              rows={2}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
          {confirmAction === 'finalize' && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              This will apply stock changes permanently and cannot be undone.
            </Alert>
          )}
          {confirmAction !== 'reject' && confirmAction !== 'finalize' && (
            <Typography>Are you sure?</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={confirmAction === 'reject' ? 'error' : confirmAction === 'finalize' ? 'warning' : 'primary'}
            onClick={() => {
              if (confirmAction === 'submit')   submitMutation.mutate();
              if (confirmAction === 'approve')  approveMutation.mutate();
              if (confirmAction === 'reject')   rejectMutation.mutate();
              if (confirmAction === 'finalize') finalizeMutation.mutate();
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

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

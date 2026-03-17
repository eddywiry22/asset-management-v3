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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import stockTransfersService, {
  TransferItem,
  TransferRequest,
  AddItemPayload,
  UpdateItemPayload,
} from '../../../services/stockTransfers.service';
import apiClient from '../../../api/client';
import { AuthUser } from '../../../types/auth.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  DRAFT:     'default',
  APPROVED:  'warning',
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

function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type SimpleProduct = { id: string; sku: string; name: string };

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
  onSave: (payload: AddItemPayload | UpdateItemPayload) => void;
  initial?: TransferItem | null;
}) {
  const [productId, setProductId] = useState(initial?.productId ?? '');
  const [qty, setQty]             = useState(initial ? String(initial.qty) : '');

  const { data: productsRes } = useQuery({
    queryKey: ['products-simple'],
    queryFn:  () => apiClient.get('products?limit=200').then((r) => r.data),
    enabled:  open,
  });
  const products: SimpleProduct[] = productsRes?.data ?? [];

  const handleSave = () => {
    const qtyNum = parseFloat(qty);
    if (isNaN(qtyNum) || qtyNum <= 0) return;
    if (initial) {
      onSave({ qty: qtyNum } as UpdateItemPayload);
    } else {
      if (!productId) return;
      onSave({ productId, qty: qtyNum } as AddItemPayload);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Item' : 'Add Item'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {!initial && (
            <FormControl fullWidth size="small">
              <InputLabel>Product</InputLabel>
              <Select
                label="Product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p: SimpleProduct) => (
                  <MenuItem key={p.id} value={p.id}>{p.sku} — {p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            label="Quantity"
            type="number"
            size="small"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputProps={{ min: 0.0001, step: 0.0001 }}
            helperText="Must be greater than 0"
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
export default function StockTransferDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const currentUser = getCurrentUser();
  // Manager and admin can approve/reject/finalize
  const canManage = currentUser?.isAdmin === true;
  // We treat any non-null user as potentially a manager; actual enforcement is server-side.
  // The UI shows approve/reject for any logged-in user; server returns 403 if unauthorized.
  // For a cleaner UX, we show these buttons only for admins — operators won't see them.
  // (Role data beyond isAdmin is not in the JWT, so we rely on server-side enforcement.)

  const [itemDialogOpen,  setItemDialogOpen]  = useState(false);
  const [editingItem,     setEditingItem]     = useState<TransferItem | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmApprove,  setConfirmApprove]  = useState(false);
  const [confirmReject,   setConfirmReject]   = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const { data: reqData, isLoading, error } = useQuery({
    queryKey: ['stock-transfer', id],
    queryFn:  () => stockTransfersService.getById(id!),
    enabled:  !!id,
  });

  const req: TransferRequest | undefined = reqData?.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-transfer', id] });
    queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
  };

  const addItemMutation = useMutation({
    mutationFn: (payload: AddItemPayload) => stockTransfersService.addItem(id!, payload),
    onSuccess: () => {
      invalidate();
      setItemDialogOpen(false);
      setSnack({ msg: 'Item added', severity: 'success' });
    },
    onError: (e: any) =>
      setSnack({ msg: e?.response?.data?.error?.message ?? 'Failed to add item', severity: 'error' }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: UpdateItemPayload }) =>
      stockTransfersService.updateItem(id!, itemId, payload),
    onSuccess: () => {
      invalidate();
      setItemDialogOpen(false);
      setEditingItem(null);
      setSnack({ msg: 'Item updated', severity: 'success' });
    },
    onError: (e: any) =>
      setSnack({ msg: e?.response?.data?.error?.message ?? 'Failed to update item', severity: 'error' }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => stockTransfersService.deleteItem(id!, itemId),
    onSuccess: () => { invalidate(); setSnack({ msg: 'Item removed', severity: 'success' }); },
    onError: () => setSnack({ msg: 'Failed to remove item', severity: 'error' }),
  });

  const approveMutation = useMutation({
    mutationFn: () => stockTransfersService.approve(id!),
    onSuccess: () => {
      invalidate();
      setConfirmApprove(false);
      setSnack({ msg: 'Transfer approved', severity: 'success' });
    },
    onError: (e: any) => {
      setConfirmApprove(false);
      setSnack({ msg: e?.response?.data?.error?.message ?? 'Approve failed', severity: 'error' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => stockTransfersService.reject(id!),
    onSuccess: () => {
      invalidate();
      setConfirmReject(false);
      setSnack({ msg: 'Transfer rejected', severity: 'success' });
    },
    onError: (e: any) => {
      setConfirmReject(false);
      setSnack({ msg: e?.response?.data?.error?.message ?? 'Reject failed', severity: 'error' });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => stockTransfersService.finalize(id!),
    onSuccess: () => {
      invalidate();
      setConfirmFinalize(false);
      setSnack({ msg: 'Transfer finalized — stock moved', severity: 'success' });
    },
    onError: (e: any) => {
      setConfirmFinalize(false);
      setSnack({ msg: e?.response?.data?.error?.message ?? 'Finalize failed', severity: 'error' });
    },
  });

  const isDraft    = req?.status === 'DRAFT';
  const isApproved = req?.status === 'APPROVED';

  if (isLoading) return <CircularProgress />;
  if (error || !req) return <Alert severity="error">Failed to load transfer request</Alert>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/stock-transfers')}>Back</Button>
        <Typography variant="h5" fontWeight={600} sx={{ flexGrow: 1 }}>
          {req.requestNumber}
        </Typography>
        <Chip label={req.status} color={STATUS_COLORS[req.status] ?? 'default'} />
      </Box>

      {/* Meta */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Source Location</Typography>
            <Typography fontWeight={600}>{req.sourceLocation?.code} — {req.sourceLocation?.name}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Destination Location</Typography>
            <Typography fontWeight={600}>{req.destinationLocation?.code} — {req.destinationLocation?.name}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Created By</Typography>
            <Typography>{userLabel(req.createdBy)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Created At</Typography>
            <Typography>{fmtDate(req.createdAt)}</Typography>
          </Box>
          {req.finalizedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Finalized At</Typography>
              <Typography>{fmtDate(req.finalizedAt)}</Typography>
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
                <TableCell align="right">Quantity</TableCell>
                <TableCell>UOM</TableCell>
                {isDraft && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {req.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">No items yet.</TableCell>
                </TableRow>
              )}
              {req.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product?.sku} — {item.product?.name}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{Number(item.qty)}</TableCell>
                  <TableCell>{item.product?.uom?.code}</TableCell>
                  {isDraft && (
                    <TableCell align="center">
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => { setEditingItem(item); setItemDialogOpen(true); }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                        >
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
      {(isDraft || isApproved) && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {/* Operator sees nothing special on DRAFT — they just edit items.
                Manager/Admin can approve or reject a DRAFT request. */}
            {isDraft && canManage && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={req.items.length === 0}
                  onClick={() => setConfirmApprove(true)}
                >
                  Approve
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => setConfirmReject(true)}
                >
                  Reject
                </Button>
              </>
            )}
            {/* Manager/Admin can finalize an APPROVED request */}
            {isApproved && canManage && (
              <Button
                variant="contained"
                color="warning"
                disabled={req.items.length === 0}
                onClick={() => setConfirmFinalize(true)}
              >
                Finalize Transfer
              </Button>
            )}
          </Box>
        </>
      )}

      {/* Add/Edit Item Dialog */}
      <ItemDialog
        key={editingItem?.id ?? 'new'}
        open={itemDialogOpen}
        onClose={() => { setItemDialogOpen(false); setEditingItem(null); }}
        onSave={(payload) => {
          if (editingItem) {
            updateItemMutation.mutate({ itemId: editingItem.id, payload: payload as UpdateItemPayload });
          } else {
            addItemMutation.mutate(payload as AddItemPayload);
          }
        }}
        initial={editingItem}
      />

      {/* Confirm Approve Dialog */}
      <Dialog open={confirmApprove} onClose={() => setConfirmApprove(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Approve Transfer</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 1 }}>
            Approving will allow this transfer to be finalized and stock moved.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmApprove(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={() => approveMutation.mutate()}>
            Confirm Approve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Reject Dialog */}
      <Dialog open={confirmReject} onClose={() => setConfirmReject(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Transfer</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Rejecting this transfer request cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReject(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => rejectMutation.mutate()}>
            Confirm Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Finalize Dialog */}
      <Dialog open={confirmFinalize} onClose={() => setConfirmFinalize(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Finalize Transfer</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Finalizing will move stock between locations and cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmFinalize(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => finalizeMutation.mutate()}
          >
            Confirm Finalize
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

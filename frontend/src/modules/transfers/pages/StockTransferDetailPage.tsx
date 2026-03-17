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
import SendIcon from '@mui/icons-material/Send';
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
const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  DRAFT:                        'default',
  SUBMITTED:                    'info',
  ORIGIN_MANAGER_APPROVED:      'warning',
  DESTINATION_OPERATOR_APPROVED: 'warning',
  READY_TO_FINALIZE:            'warning',
  FINALIZED:                    'success',
  CANCELLED:                    'error',
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
// Confirm Dialog helper
// ---------------------------------------------------------------------------
function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmColor,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmColor?: 'success' | 'error' | 'warning' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={confirmColor ?? 'primary'} onClick={onConfirm}>
          {confirmLabel}
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
  const isAdmin     = currentUser?.isAdmin === true;
  const userId      = currentUser?.id ?? '';

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem,    setEditingItem]    = useState<TransferItem | null>(null);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<
    'submit' | 'approveOrigin' | 'approveDestination' | 'finalize' | 'cancel' | 'delete' | null
  >(null);

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

  // --- Item mutations ---
  const addItemMutation = useMutation({
    mutationFn: (payload: AddItemPayload) => stockTransfersService.addItem(id!, payload),
    onSuccess: () => { invalidate(); setItemDialogOpen(false); setSnack({ msg: 'Item added', severity: 'success' }); },
    onError: (e: any) => setSnack({ msg: e?.response?.data?.error?.message ?? 'Failed to add item', severity: 'error' }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: UpdateItemPayload }) =>
      stockTransfersService.updateItem(id!, itemId, payload),
    onSuccess: () => { invalidate(); setItemDialogOpen(false); setEditingItem(null); setSnack({ msg: 'Item updated', severity: 'success' }); },
    onError: (e: any) => setSnack({ msg: e?.response?.data?.error?.message ?? 'Failed to update item', severity: 'error' }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => stockTransfersService.deleteItem(id!, itemId),
    onSuccess: () => { invalidate(); setSnack({ msg: 'Item removed', severity: 'success' }); },
    onError: () => setSnack({ msg: 'Failed to remove item', severity: 'error' }),
  });

  // --- Workflow mutations ---
  const mkWorkflowMutation = (
    mutFn: () => Promise<any>,
    successMsg: string,
  ) => useMutation({
    mutationFn: mutFn,
    onSuccess: () => { invalidate(); setConfirmAction(null); setSnack({ msg: successMsg, severity: 'success' }); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Operation failed', severity: 'error' }); },
  });

  const submitMutation          = mkWorkflowMutation(() => stockTransfersService.submit(id!), 'Transfer submitted');
  const approveOriginMutation   = mkWorkflowMutation(() => stockTransfersService.approveOrigin(id!), 'Origin approved');
  const approveDestMutation     = mkWorkflowMutation(() => stockTransfersService.approveDestination(id!), 'Destination approved — ready to finalize');
  const finalizeMutation        = mkWorkflowMutation(() => stockTransfersService.finalize(id!), 'Transfer finalized — stock moved');
  const cancelMutation          = mkWorkflowMutation(() => stockTransfersService.cancel(id!), 'Transfer cancelled');

  const deleteMutation = useMutation({
    mutationFn: () => stockTransfersService.deleteRequest(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stock-transfers'] }); navigate('/stock-transfers'); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Delete failed', severity: 'error' }); },
  });

  if (isLoading) return <CircularProgress />;
  if (error || !req) return <Alert severity="error">Failed to load transfer request</Alert>;

  const status      = req.status;
  const isDraft     = status === 'DRAFT';
  const isSubmitted = status === 'SUBMITTED';
  const isOriginApproved = status === 'ORIGIN_MANAGER_APPROVED';
  const isReady     = status === 'READY_TO_FINALIZE';
  const isTerminal  = status === 'FINALIZED' || status === 'CANCELLED';

  const isCreator = req.createdById === userId;
  const canCancel = !isTerminal && (isAdmin || isCreator);
  const canDelete = isDraft && (isAdmin || isCreator);

  // Workflow action confirmation config
  const actionConfig: Record<string, { title: string; body: React.ReactNode; label: string; color: 'success' | 'error' | 'warning' | 'primary'; onConfirm: () => void }> = {
    submit: {
      title: 'Submit Transfer',
      body: <Alert severity="info" sx={{ mt: 1 }}>Submitting will send this request for origin manager approval.</Alert>,
      label: 'Confirm Submit',
      color: 'primary',
      onConfirm: () => submitMutation.mutate(),
    },
    approveOrigin: {
      title: 'Approve at Origin',
      body: <Alert severity="info" sx={{ mt: 1 }}>Approving at origin confirms the source location has stock available.</Alert>,
      label: 'Confirm Approve',
      color: 'success',
      onConfirm: () => approveOriginMutation.mutate(),
    },
    approveDestination: {
      title: 'Approve at Destination',
      body: <Alert severity="info" sx={{ mt: 1 }}>Approving at destination confirms the receiving location accepts the stock. The request will move to READY TO FINALIZE.</Alert>,
      label: 'Confirm Approve',
      color: 'success',
      onConfirm: () => approveDestMutation.mutate(),
    },
    finalize: {
      title: 'Finalize Transfer',
      body: <Alert severity="warning" sx={{ mt: 1 }}>Finalizing will move stock between locations. This cannot be undone.</Alert>,
      label: 'Confirm Finalize',
      color: 'warning',
      onConfirm: () => finalizeMutation.mutate(),
    },
    cancel: {
      title: 'Cancel Transfer',
      body: <Alert severity="warning" sx={{ mt: 1 }}>Cancelling this transfer request cannot be undone.</Alert>,
      label: 'Confirm Cancel',
      color: 'error',
      onConfirm: () => cancelMutation.mutate(),
    },
    delete: {
      title: 'Delete Transfer',
      body: <Alert severity="error" sx={{ mt: 1 }}>This will permanently delete the DRAFT request and all its items.</Alert>,
      label: 'Confirm Delete',
      color: 'error',
      onConfirm: () => deleteMutation.mutate(),
    },
  };

  const activeConfirm = confirmAction ? actionConfig[confirmAction] : null;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/stock-transfers')}>Back</Button>
        <Typography variant="h5" fontWeight={600} sx={{ flexGrow: 1 }}>
          {req.requestNumber}
        </Typography>
        <Chip label={req.status.replace(/_/g, ' ')} color={STATUS_COLORS[req.status] as any} />
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
          {req.submittedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Submitted At</Typography>
              <Typography>{fmtDate(req.submittedAt)}</Typography>
            </Box>
          )}
          {req.originApprovedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Origin Approved By</Typography>
              <Typography>{userLabel(req.originApprovedBy)} — {fmtDate(req.originApprovedAt)}</Typography>
            </Box>
          )}
          {req.destinationApprovedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Destination Approved By</Typography>
              <Typography>{userLabel(req.destinationApprovedBy)} — {fmtDate(req.destinationApprovedAt)}</Typography>
            </Box>
          )}
          {req.finalizedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Finalized At</Typography>
              <Typography>{fmtDate(req.finalizedAt)}</Typography>
            </Box>
          )}
          {req.cancelledAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Cancelled By</Typography>
              <Typography>{userLabel(req.cancelledBy)} — {fmtDate(req.cancelledAt)}</Typography>
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
      {!isTerminal && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>

            {/* DRAFT: Submit (creator/admin) */}
            {isDraft && (isAdmin || isCreator) && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<SendIcon />}
                disabled={req.items.length === 0}
                onClick={() => setConfirmAction('submit')}
              >
                Submit for Approval
              </Button>
            )}

            {/* DRAFT: Delete (creator/admin) */}
            {canDelete && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setConfirmAction('delete')}
              >
                Delete Request
              </Button>
            )}

            {/* SUBMITTED: Approve at Origin (manager/admin with source access) */}
            {isSubmitted && isAdmin && (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={req.items.length === 0}
                onClick={() => setConfirmAction('approveOrigin')}
              >
                Approve (Origin Manager)
              </Button>
            )}

            {/* ORIGIN_MANAGER_APPROVED: Approve at Destination (user with dest access / admin) */}
            {isOriginApproved && isAdmin && (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                onClick={() => setConfirmAction('approveDestination')}
              >
                Approve (Destination)
              </Button>
            )}

            {/* READY_TO_FINALIZE: Finalize (admin or source access) */}
            {isReady && isAdmin && (
              <Button
                variant="contained"
                color="warning"
                disabled={req.items.length === 0}
                onClick={() => setConfirmAction('finalize')}
              >
                Finalize Transfer
              </Button>
            )}

            {/* Cancel — any non-terminal state, creator or admin */}
            {canCancel && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelOutlinedIcon />}
                onClick={() => setConfirmAction('cancel')}
              >
                Cancel
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

      {/* Dynamic Confirm Dialog */}
      {activeConfirm && (
        <ConfirmDialog
          open={!!confirmAction}
          title={activeConfirm.title}
          body={activeConfirm.body}
          confirmLabel={activeConfirm.label}
          confirmColor={activeConfirm.color}
          onConfirm={activeConfirm.onConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}

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

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
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SendIcon from '@mui/icons-material/Send';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import stockAdjustmentsService, {
  AdjustmentItem,
  AdjustmentRequest,
  AddItemPayload,
} from '../../../services/stockAdjustments.service';
import stockService from '../../../services/stock.service';
import { useAuth } from '../../../context/AuthContext';
import ActionReasonModal from '../../../components/ActionReasonModal';
import { WorkflowWarningBanner } from '../../../components/WorkflowWarningBanner';
import { WORKFLOW_WARNINGS } from '../../../utils/workflowWarnings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtQty(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  DRAFT:     'default',
  SUBMITTED: 'warning',
  APPROVED:  'info',
  REJECTED:  'error',
  FINALIZED: 'success',
  CANCELLED: 'error',
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

  const { data: locationsRes } = useQuery({
    queryKey: ['locations-simple'],
    queryFn:  () => stockService.getVisibleLocations(),
    enabled:  open,
  });

  const { data: registeredProducts } = useQuery({
    queryKey: ['registered-products', locationId],
    queryFn:  () => stockService.getRegisteredProducts(locationId),
    enabled:  open && !!locationId,
  });

  const locations: SimpleLocation[] = locationsRes ?? [];
  const products: SimpleProduct[]   = registeredProducts ?? [];
  const noProducts = !!locationId && (registeredProducts !== undefined) && products.length === 0;

  const handleLocationChange = (newLocationId: string) => {
    setLocationId(newLocationId);
    setProductId('');
  };

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
            <InputLabel>Location</InputLabel>
            <Select label="Location" value={locationId} onChange={(e) => handleLocationChange(e.target.value)}>
              {locations.map((l: SimpleLocation) => (
                <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {noProducts && (
            <Alert severity="warning">No products registered for this location</Alert>
          )}
          <FormControl fullWidth size="small" disabled={!locationId || noProducts}>
            <InputLabel>Product</InputLabel>
            <Select label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p: SimpleProduct) => (
                <MenuItem key={p.id} value={p.id}>{p.sku} — {p.name}</MenuItem>
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
export default function StockAdjustmentDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { isAdmin, user: currentUser } = useAuth();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem,    setEditingItem]    = useState<AdjustmentItem | null>(null);
  const [confirmAction,    setConfirmAction]    = useState<'submit' | 'approve' | 'finalize' | 'delete' | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const { data: reqData, isLoading, error } = useQuery({
    queryKey: ['stock-adjustment', id],
    queryFn:  () => stockAdjustmentsService.getById(id!),
    enabled:  !!id,
  });

  const { data: myLocations } = useQuery({
    queryKey: ['locations-mine'],
    queryFn:  () => stockService.getVisibleLocations(),
    enabled:  !isAdmin,
  });
  const isManager = isAdmin || (myLocations ?? []).some((l) => l.role === 'MANAGER');

  const req: AdjustmentRequest | undefined = reqData?.data;

  // Fetch readiness for all item locations — warn if no managers to approve or eligible users to finalize
  const itemLocationIds = [...new Set((req?.items ?? []).map((i) => i.locationId))];
  const { data: itemLocationReadinesses } = useQuery({
    queryKey: ['location-readiness-adj', id, itemLocationIds.join(',')],
    queryFn:  async () => {
      const results = await Promise.all(
        itemLocationIds.map((lid) => stockService.getLocationReadiness(lid)),
      );
      return results;
    },
    enabled: !isAdmin && itemLocationIds.length > 0 && !!req && req.status !== 'FINALIZED' && req.status !== 'CANCELLED' && req.status !== 'REJECTED',
  });

  // No managers at any item location → adjustment may get stuck at SUBMITTED
  const noManagersAtItemLocations =
    !isAdmin &&
    itemLocationReadinesses !== undefined &&
    itemLocationReadinesses.every((r: { hasManager: boolean }) => !r.hasManager);

  // No eligible users (OPERATOR or MANAGER) at item locations → finalize blocked
  const noEligibleUsersToFinalize =
    !isAdmin &&
    itemLocationReadinesses !== undefined &&
    itemLocationReadinesses.every((r: { hasOperator: boolean; hasManager: boolean }) => !r.hasOperator && !r.hasManager);

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
    mutationFn: (reason: string) => stockAdjustmentsService.reject(id!, reason),
    onSuccess: () => { invalidate(); setRejectDialogOpen(false); setSnack({ msg: 'Rejected', severity: 'success' }); },
    onError: (e: any) => { setSnack({ msg: e?.response?.data?.error?.message ?? 'Reject failed', severity: 'error' }); },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => stockAdjustmentsService.finalize(id!),
    onSuccess: () => { invalidate(); setConfirmAction(null); setSnack({ msg: 'Finalized — stock updated', severity: 'success' }); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Finalize failed', severity: 'error' }); },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => stockAdjustmentsService.cancel(id!, reason),
    onSuccess: () => { invalidate(); setCancelDialogOpen(false); setSnack({ msg: 'Request cancelled', severity: 'success' }); },
    onError: (e: any) => { setSnack({ msg: e?.response?.data?.error?.message ?? 'Cancel failed', severity: 'error' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => stockAdjustmentsService.deleteRequest(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] }); navigate('/stock-adjustments'); },
    onError: (e: any) => { setConfirmAction(null); setSnack({ msg: e?.response?.data?.error?.message ?? 'Delete failed', severity: 'error' }); },
  });

  const isDraft     = req?.status === 'DRAFT';
  const isSubmitted = req?.status === 'SUBMITTED';
  const isApproved  = req?.status === 'APPROVED';
  const isTerminal  = req?.status === 'FINALIZED' || req?.status === 'CANCELLED' || req?.status === 'REJECTED';
  const isCreator   = req?.createdById === (currentUser?.id ?? '');
  const canDelete   = isDraft && isCreator;
  // F3: hide Cancel when Approve/Reject buttons are already shown (when submitted and user is manager)
  const approveRejectVisible = isSubmitted && isManager;
  const canCancel   = !isDraft && !isTerminal && !approveRejectVisible && (isAdmin || isCreator || isManager);

  if (isLoading) return <CircularProgress />;
  if (error || !req) return <Alert severity="error">Failed to load request</Alert>;

  return (
    <Box>
      {/* Header */}
      {(() => {
        const inactiveForFinalize = isApproved ? req.items.filter((i) => i.isActiveNow === false) : [];
        return (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: inactiveForFinalize.length > 0 || (noManagersAtItemLocations && !isTerminal) ? 1 : 2 }}>
              <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/stock-adjustments')}>Back</Button>
              <Typography variant="h5" fontWeight={600} sx={{ flexGrow: 1 }}>
                {req.requestNumber}
              </Typography>
              <Chip label={req.status} color={STATUS_COLORS[req.status] ?? 'default'} />
            </Box>
            {inactiveForFinalize.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {inactiveForFinalize.length} item(s) have inactive product registrations and cannot be finalized. Reactivate or remove them first.
              </Alert>
            )}

            {/* Manager readiness warning — shown from DRAFT onwards for any non-terminal status */}
            {noManagersAtItemLocations && !isTerminal && (
              <WorkflowWarningBanner message={WORKFLOW_WARNINGS.adjustmentMissingManagers} />
            )}
          </>
        );
      })()}

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
          {req.rejectedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Rejected By / At</Typography>
              <Typography>{userLabel(req.rejectedBy)} — {fmtDate(req.rejectedAt)}</Typography>
            </Box>
          )}
          {req.rejectionReason && (
            <Box sx={{ flexBasis: '100%' }}>
              <Typography variant="caption" color="text.secondary">Rejection Reason</Typography>
              <Typography color="error.main">{req.rejectionReason}</Typography>
            </Box>
          )}
          {req.cancelledAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Cancelled By / At</Typography>
              <Typography>{userLabel(req.cancelledBy)} — {fmtDate(req.cancelledAt)}</Typography>
            </Box>
          )}
          {req.cancellationReason && (
            <Box sx={{ flexBasis: '100%' }}>
              <Typography variant="caption" color="text.secondary">Cancellation Reason</Typography>
              <Typography color="error.main">{req.cancellationReason}</Typography>
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
        {isDraft && isCreator && (
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
                <TableCell align="right">
                  <Tooltip title={isDraft ? 'Live available stock at this location (updates in real-time)' : 'Stock snapshot captured when item was added to the request'} arrow>
                    <span style={{ cursor: 'help', borderBottom: '1px dashed' }}>Qty Before</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={isDraft ? 'Projected stock after this adjustment (live, recalculated)' : 'Projected stock after adjustment (from creation snapshot)'} arrow>
                    <span style={{ cursor: 'help', borderBottom: '1px dashed' }}>Qty After</span>
                  </Tooltip>
                </TableCell>
                <TableCell>Reason</TableCell>
                {isDraft && isCreator && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {req.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">No items yet.</TableCell>
                </TableRow>
              )}
              {req.items.map((item) => {
                const afterQty = item.afterQty != null ? Number(item.afterQty) : null;
                const isLow    = afterQty != null && afterQty < 0;
                return (
                  <TableRow
                    key={item.id}
                    sx={isLow ? { backgroundColor: 'rgba(211,47,47,0.06)' } : undefined}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {item.product?.sku} — {item.product?.name}
                        {!isTerminal && item.isActiveNow === false && (
                          <Chip label="Now Inactive" size="small" color="warning" />
                        )}
                        {isLow && (
                          <Chip label="Negative Stock" size="small" color="error" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{item.location?.code} — {item.location?.name}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: Number(item.qtyChange) >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
                    >
                      {Number(item.qtyChange) >= 0 ? '+' : ''}{Number(item.qtyChange)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>
                      {fmtQty(item.beforeQty)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 600, color: isLow ? 'error.main' : 'text.primary' }}
                    >
                      {fmtQty(afterQty)}
                    </TableCell>
                    <TableCell>{item.reason ?? '—'}</TableCell>
                    {isDraft && isCreator && (
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
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Workflow Actions */}
      {!isTerminal && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>

            {/* DRAFT: Submit (creator only) */}
            {isDraft && isCreator && (
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

            {/* DRAFT: Delete (creator only) */}
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

            {/* SUBMITTED: Approve/Reject — managers and admins */}
            {isSubmitted && isManager && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={req.items.length === 0}
                  onClick={() => setConfirmAction('approve')}
                >
                  Approve
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  Reject
                </Button>
              </>
            )}

            {/* APPROVED: Finalize */}
            {isApproved && isManager && (
              <Button
                variant="contained"
                color="warning"
                disabled={req.items.length === 0 || req.items.some((i) => i.isActiveNow === false) || noManagersAtItemLocations}
                onClick={() => setConfirmAction('finalize')}
              >
                Finalize (Apply Stock Changes)
              </Button>
            )}

            {/* Cancel */}
            {canCancel && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelOutlinedIcon />}
                onClick={() => setCancelDialogOpen(true)}
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
            updateItemMutation.mutate({ itemId: editingItem.id, payload });
          } else {
            addItemMutation.mutate(payload);
          }
        }}
        initial={editingItem}
      />

      {/* Confirm Action Dialog (submit / approve / finalize / delete) */}
      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          title={
            confirmAction === 'submit'   ? 'Submit Request' :
            confirmAction === 'approve'  ? 'Approve Request' :
            confirmAction === 'finalize' ? 'Finalize Request' :
            'Delete Request'
          }
          body={(() => {
            const hasInactiveForApprove = confirmAction === 'approve' && req.items.some((i) => i.isActiveNow === false);
            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                {hasInactiveForApprove && (
                  <Alert severity="warning">
                    Warning: {req.items.filter((i) => i.isActiveNow === false).length} item(s) have inactive product registrations. Approval will still proceed.
                  </Alert>
                )}
                {confirmAction === 'finalize' && (
                  <Alert severity="warning">This will apply stock changes permanently and cannot be undone.</Alert>
                )}
                {confirmAction === 'delete' && (
                  <Alert severity="error">This will permanently delete the DRAFT request and all its items.</Alert>
                )}
                {(confirmAction === 'submit' || (confirmAction === 'approve' && !hasInactiveForApprove)) && (
                  <Alert severity="info">Are you sure you want to proceed?</Alert>
                )}
              </Box>
            );
          })()}
          confirmLabel={
            confirmAction === 'submit'   ? 'Confirm Submit' :
            confirmAction === 'approve'  ? 'Confirm Approve' :
            confirmAction === 'finalize' ? 'Confirm Finalize' :
            'Confirm Delete'
          }
          confirmColor={
            confirmAction === 'finalize' ? 'warning' :
            confirmAction === 'delete'   ? 'error' :
            confirmAction === 'approve'  ? 'success' :
            'primary'
          }
          onConfirm={() => {
            if (confirmAction === 'submit')   submitMutation.mutate();
            if (confirmAction === 'approve')  approveMutation.mutate();
            if (confirmAction === 'finalize') finalizeMutation.mutate();
            if (confirmAction === 'delete')   deleteMutation.mutate();
          }}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {/* Reject Modal */}
      <ActionReasonModal
        open={rejectDialogOpen}
        type="reject"
        title="Reject Request"
        confirmLabel="Confirm Reject"
        loading={rejectMutation.isPending}
        onSubmit={(reason) => rejectMutation.mutate(reason)}
        onClose={() => setRejectDialogOpen(false)}
      />

      {/* Cancel Modal */}
      <ActionReasonModal
        open={cancelDialogOpen}
        type="cancel"
        title="Cancel Request"
        confirmLabel="Confirm Cancel"
        loading={cancelMutation.isPending}
        onSubmit={(reason) => cancelMutation.mutate(reason)}
        onClose={() => setCancelDialogOpen(false)}
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

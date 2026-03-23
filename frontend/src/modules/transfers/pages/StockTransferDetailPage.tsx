import { useState, useMemo } from 'react';
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
import stockService from '../../../services/stock.service';
import { AuthUser } from '../../../types/auth.types';
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

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  DRAFT:                        'default',
  SUBMITTED:                    'info',
  ORIGIN_MANAGER_APPROVED:      'warning',
  DESTINATION_OPERATOR_APPROVED: 'warning',
  READY_TO_FINALIZE:            'warning',
  FINALIZED:                    'success',
  CANCELLED:                    'error',
  REJECTED:                     'error',
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
  sourceLocationId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: AddItemPayload | UpdateItemPayload) => void;
  initial?: TransferItem | null;
  sourceLocationId?: string;
}) {
  const [productId, setProductId] = useState(initial?.productId ?? '');
  const [qty, setQty]             = useState(initial ? String(initial.qty) : '');

  const { data: registeredProducts } = useQuery({
    queryKey: ['registered-products', sourceLocationId],
    queryFn:  () => stockService.getRegisteredProducts(sourceLocationId!),
    enabled:  open && !initial && !!sourceLocationId,
  });
  const products: SimpleProduct[] = registeredProducts ?? [];
  const noProducts = !initial && !!sourceLocationId && (registeredProducts !== undefined) && products.length === 0;

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
            <>
              {noProducts && (
                <Alert severity="warning">No active products at this location</Alert>
              )}
              <FormControl fullWidth size="small" disabled={noProducts}>
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
            </>
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

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const { data: reqData, isLoading, error } = useQuery({
    queryKey: ['stock-transfer', id],
    queryFn:  () => stockTransfersService.getById(id!),
    enabled:  !!id,
  });

  const req: TransferRequest | undefined = reqData?.data;

  // Fetch location-role mapping for the current non-admin user.
  // Admins bypass all role checks, so we skip this query for them.
  const { data: myLocations } = useQuery({
    queryKey: ['locations-mine'],
    queryFn:  () => stockService.getVisibleLocations(),
    enabled:  !isAdmin,
  });

  // Fetch products registered at destination — used to warn early and hard-block finalize.
  // Query is enabled for all post-DRAFT statuses so the warning appears as soon as the
  // request is submitted; it is NOT enabled while still in DRAFT because the destination
  // registration check is informational, not a creation blocker.
  // Source of truth: ProductLocation table (isActive=true) via backend API — never stock
  // balances or ledger, so the result is deterministic for the same input.
  const dstLocationId = req?.destinationLocationId;
  const { data: destRegisteredProducts } = useQuery({
    queryKey: ['registered-products-dest', dstLocationId],
    queryFn:  () => stockService.getRegisteredProducts(dstLocationId!),
    enabled:  !!dstLocationId && !!req && req.status !== 'DRAFT',
    staleTime: 30_000,
  });

  // Stable lookup map — built once when the query result changes, not on every render.
  // Guards against stale .find() / Set comparisons on partial data.
  const destRegisteredIds = useMemo(
    () => new Set((destRegisteredProducts ?? []).map((p) => p.id)),
    [destRegisteredProducts],
  );

  // Only flag items once the registration data is actually loaded.
  // When destRegisteredProducts is undefined (query pending/disabled), treat as empty
  // list of unregistered items so we never show a false warning.
  const itemsNotAtDest = useMemo(
    () => destRegisteredProducts !== undefined
      ? (req?.items ?? []).filter((i) => !destRegisteredIds.has(i.productId))
      : [],
    [destRegisteredProducts, destRegisteredIds, req?.items],
  );

  // Fetch destination readiness — warn if no eligible users can complete the workflow
  const { data: destReadiness } = useQuery({
    queryKey: ['location-readiness', dstLocationId],
    queryFn:  () => stockService.getLocationReadiness(dstLocationId!),
    enabled:  !!dstLocationId && !isAdmin,
  });
  const destHasNoEligibleUsers =
    !isAdmin &&
    destReadiness !== undefined &&
    !destReadiness.transferInboundReady;


  // Build a Map<locationId, role> from the user's visible locations.
  // Only non-null role values are stored; admin users skip this entirely.
  const myRoleMap = new Map(
    (myLocations ?? []).filter((l) => l.role).map((l) => [l.id, l.role as string])
  );

  // Location-specific permission flags (resolved once req is loaded).
  // All explicit so there is no ambiguity about what "has access" means.
  const srcId  = req?.sourceLocationId      ?? '';
  const dstId  = req?.destinationLocationId ?? '';
  const srcRole = myRoleMap.get(srcId) ?? '';
  const dstRole = myRoleMap.get(dstId) ?? '';

  const isManagerAtSource       = isAdmin || srcRole === 'MANAGER';
  // Any role (OPERATOR or MANAGER) at destination is sufficient
  const isOperatorAtDestination = isAdmin || dstRole === 'OPERATOR' || dstRole === 'MANAGER';
  // Finalize only requires destination access (the person who approved dest step can finalize)
  const canFinalize             = isAdmin || dstRole === 'OPERATOR' || dstRole === 'MANAGER';

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
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => stockTransfersService.cancel(id!, reason),
    onSuccess: () => { invalidate(); setCancelDialogOpen(false); setSnack({ msg: 'Transfer cancelled', severity: 'success' }); },
    onError: (e: any) => { setSnack({ msg: e?.response?.data?.error?.message ?? 'Operation failed', severity: 'error' }); },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => stockTransfersService.reject(id!, reason),
    onSuccess: () => { invalidate(); setRejectDialogOpen(false); setSnack({ msg: 'Transfer rejected', severity: 'success' }); },
    onError: (e: any) => { setSnack({ msg: e?.response?.data?.error?.message ?? 'Operation failed', severity: 'error' }); },
  });

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
  const isTerminal  = status === 'FINALIZED' || status === 'CANCELLED' || status === 'REJECTED';

  const isCreator = req.createdById === userId;
  // Cancel: SUBMITTED+ (DRAFT uses Delete); any participant or creator/admin
  // F3: hide Cancel when Approve/Reject buttons are already shown to avoid duplicate actions
  const hasLocationAccess = isAdmin || srcRole !== '' || dstRole !== '';
  const approveRejectVisible = (isSubmitted && isManagerAtSource) || (isOriginApproved && isOperatorAtDestination);
  const canCancel = !isDraft && !isTerminal && !approveRejectVisible && (isAdmin || isCreator || hasLocationAccess);
  const canDelete = isDraft && isCreator;

  const hasInactiveItems = (req?.items ?? []).some((i) => i.isActiveNow === false);
  const inactiveCount    = (req?.items ?? []).filter((i) => i.isActiveNow === false).length;

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
      body: (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          {hasInactiveItems && (
            <Alert severity="warning">
              Warning: {inactiveCount} item(s) have inactive product registrations at source. The approval will still proceed.
            </Alert>
          )}
          <Alert severity="info">Approving at origin confirms the source location has stock available.</Alert>
        </Box>
      ),
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
      body: (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          {hasInactiveItems && (
            <Alert severity="warning">
              Warning: {inactiveCount} item(s) have inactive product registrations at source.
            </Alert>
          )}
          <Alert severity="warning">Finalizing will move stock between locations. This cannot be undone.</Alert>
        </Box>
      ),
      label: 'Confirm Finalize',
      color: 'warning',
      onConfirm: () => finalizeMutation.mutate(),
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: itemsNotAtDest.length > 0 ? 1 : 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/stock-transfers')}>Back</Button>
        <Typography variant="h5" fontWeight={600} sx={{ flexGrow: 1 }}>
          {req.requestNumber}
        </Typography>
        <Chip label={req.status.replace(/_/g, ' ')} color={STATUS_COLORS[req.status] as any} />
      </Box>

      {/* Destination registration alert — only shown once registration data is loaded and
          a genuine mismatch exists. Never shown during data loading to avoid false positives. */}
      {itemsNotAtDest.length > 0 && !isTerminal && (
        <Tooltip
          title="Products must have an active registration at the destination location before this transfer can be finalized. Contact an admin to register the missing products."
          arrow
          placement="bottom-start"
        >
          <Alert severity="error" sx={{ mb: 2, cursor: 'help' }}>
            {itemsNotAtDest.length} item(s) — {itemsNotAtDest.map((i) => i.product?.sku ?? i.productId).join(', ')} — are inactive at the selected location and must be activated before finalizing.
          </Alert>
        </Tooltip>
      )}

      {/* Destination readiness warning — shown from DRAFT onwards for any non-terminal status */}
      {destHasNoEligibleUsers && !isTerminal && (
        <WorkflowWarningBanner message={WORKFLOW_WARNINGS.transferDestinationMissingUsers} />
      )}

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
          {req.cancellationReason && (
            <Box sx={{ flexBasis: '100%' }}>
              <Typography variant="caption" color="text.secondary">Cancellation Reason</Typography>
              <Typography color="error.main">{req.cancellationReason}</Typography>
            </Box>
          )}
          {req.rejectedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">Rejected By</Typography>
              <Typography>{userLabel(req.rejectedBy)} — {fmtDate(req.rejectedAt)}</Typography>
            </Box>
          )}
          {req.rejectionReason && (
            <Box sx={{ flexBasis: '100%' }}>
              <Typography variant="caption" color="text.secondary">Rejection Reason</Typography>
              <Typography color="error.main">{req.rejectionReason}</Typography>
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
                <TableCell align="right">Qty Transfer</TableCell>
                <TableCell>UOM</TableCell>
                <TableCell align="right">
                  <Tooltip title={status === 'FINALIZED' ? 'Source stock at time of finalization (historical snapshot)' : 'Live available stock at source location'} arrow>
                    <span style={{ cursor: 'help', borderBottom: '1px dashed' }}>Origin Before</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={status === 'FINALIZED' ? 'Source stock after transfer (historical snapshot)' : 'Projected source stock after transfer (live)'} arrow>
                    <span style={{ cursor: 'help', borderBottom: '1px dashed' }}>Origin After</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={status === 'FINALIZED' ? 'Destination stock at time of finalization (historical snapshot)' : 'Live available stock at destination location'} arrow>
                    <span style={{ cursor: 'help', borderBottom: '1px dashed' }}>Dest. Before</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={status === 'FINALIZED' ? 'Destination stock after receiving transfer (historical snapshot)' : 'Projected destination stock after transfer (live)'} arrow>
                    <span style={{ cursor: 'help', borderBottom: '1px dashed' }}>Dest. After</span>
                  </Tooltip>
                </TableCell>
                {isDraft && isCreator && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {req.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center">No items yet.</TableCell>
                </TableRow>
              )}
              {req.items.map((item) => {
                const afterOrigin = item.afterQtyOrigin != null ? Number(item.afterQtyOrigin) : null;
                const isLow       = afterOrigin != null && afterOrigin < 0;
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
                          <Chip label="Low Stock" size="small" color="error" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{Number(item.qty)}</TableCell>
                    <TableCell>{item.product?.uom?.code}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>
                      {fmtQty(item.beforeQtyOrigin)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 600, color: isLow ? 'error.main' : 'text.primary' }}
                    >
                      {fmtQty(afterOrigin)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>
                      {fmtQty(item.beforeQtyDestination)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {fmtQty(item.afterQtyDestination)}
                    </TableCell>
                    {isDraft && isCreator && (
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

            {/* SUBMITTED: Approve/Reject at Origin — manager at source (or admin) */}
            {isSubmitted && isManagerAtSource && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={req.items.length === 0}
                  onClick={() => setConfirmAction('approveOrigin')}
                >
                  Approve (Origin)
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

            {/* ORIGIN_MANAGER_APPROVED: Approve/Reject at Destination — OPERATOR or MANAGER at destination (or admin) */}
            {isOriginApproved && isOperatorAtDestination && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  onClick={() => setConfirmAction('approveDestination')}
                >
                  Approve (Destination)
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

            {/* READY_TO_FINALIZE: Finalize — destination user (or admin) */}
            {isReady && canFinalize && (
              <Button
                variant="contained"
                color="warning"
                disabled={req.items.length === 0 || itemsNotAtDest.length > 0 || destHasNoEligibleUsers}
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
            updateItemMutation.mutate({ itemId: editingItem.id, payload: payload as UpdateItemPayload });
          } else {
            addItemMutation.mutate(payload as AddItemPayload);
          }
        }}
        initial={editingItem}
        sourceLocationId={req.sourceLocationId}
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

      {/* Cancel Modal */}
      <ActionReasonModal
        open={cancelDialogOpen}
        type="cancel"
        title="Cancel Transfer"
        confirmLabel="Confirm Cancel"
        loading={cancelMutation.isPending}
        onSubmit={(reason) => cancelMutation.mutate(reason)}
        onClose={() => setCancelDialogOpen(false)}
      />

      {/* Reject Modal */}
      <ActionReasonModal
        open={rejectDialogOpen}
        type="reject"
        title="Reject Transfer"
        confirmLabel="Confirm Reject"
        loading={rejectMutation.isPending}
        onSubmit={(reason) => rejectMutation.mutate(reason)}
        onClose={() => setRejectDialogOpen(false)}
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

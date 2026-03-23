import { useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, Select, SelectChangeEvent,
  Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography, Paper, CircularProgress,
  Alert, MenuItem, Tooltip, Snackbar, Toolbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  productRegistrationsService,
  ProductRegistration,
} from '../../../services/productRegistrations.service';
import { productsService } from '../../../services/products.service';
import stockService from '../../../services/stock.service';

const createSchema = z.object({
  productId:  z.string().min(1, 'Product is required'),
  locationId: z.string().min(1, 'Location is required'),
  isActive:   z.boolean().optional(),
});

const editSchema = z.object({
  isActive: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

export default function ProductRegistrationsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen]       = useState(false);
  const [editTarget, setEditTarget]       = useState<ProductRegistration | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<ProductRegistration | null>(null);
  const [apiError, setApiError]           = useState('');

  // Pagination state (MUI TablePagination uses 0-based page)
  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Staging filters
  const [productId,  setProductId]  = useState('');
  const [locationId, setLocationId] = useState('');
  const [status,     setStatus]     = useState('ALL');

  // Applied filters — committed on Apply, drives the query key
  const [appliedFilters, setAppliedFilters] = useState({
    productId:  '',
    locationId: '',
    status:     'ALL',
  });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Bulk action confirmation dialog
  const [bulkConfirm, setBulkConfirm] = useState<{ isActive: boolean } | null>(null);

  // Toast/snackbar
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'warning' | 'error' } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn:  productsService.getAll,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['all-locations'],
    queryFn:  stockService.getAllLocations,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-registrations', page, rowsPerPage, appliedFilters],
    queryFn:  () => productRegistrationsService.getAll({
      page:       page + 1,
      pageSize:   rowsPerPage,
      status:     appliedFilters.status,
      ...(appliedFilters.productId  ? { productId:  appliedFilters.productId  } : {}),
      ...(appliedFilters.locationId ? { locationId: appliedFilters.locationId } : {}),
    }),
  });

  const registrations = data?.data  ?? [];
  const total         = data?.meta?.total ?? 0;

  const createForm = useForm<CreateForm>({
    resolver:      zodResolver(createSchema),
    defaultValues: { isActive: true },
  });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: productRegistrationsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-registrations'] });
      setCreateOpen(false);
      createForm.reset();
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to create registration');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) =>
      productRegistrationsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-registrations'] });
      setEditTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to update registration');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productRegistrationsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-registrations'] });
      setDeleteTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to delete registration');
    },
  });

  const bulkToggleMutation = useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      productRegistrationsService.bulkToggle(ids, isActive),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['product-registrations'] });
      setSelectedIds([]);
      setBulkConfirm(null);
      const { successCount, failed } = result;
      if (successCount === 0) {
        setSnack({ msg: 'No items updated (all blocked by active requests)', severity: 'warning' });
      } else if (failed.length === 0) {
        setSnack({ msg: `${successCount} item${successCount !== 1 ? 's' : ''} updated successfully`, severity: 'success' });
      } else {
        setSnack({ msg: `${successCount} updated, ${failed.length} skipped (in use)`, severity: 'warning' });
      }
    },
    onError: (err: any) => {
      setBulkConfirm(null);
      setSnack({ msg: err?.response?.data?.error?.message ?? 'Bulk toggle failed', severity: 'error' });
    },
  });

  // Pre-check pending requests when the edit dialog opens for an active registration
  const { data: deactivationCheck } = useQuery({
    queryKey: ['check-deactivate', editTarget?.id],
    queryFn:  () => productRegistrationsService.checkDeactivation(editTarget!.id),
    enabled:  !!editTarget && editTarget.isActive,
  });

  const openEdit = (item: ProductRegistration) => {
    setEditTarget(item);
    editForm.reset({ isActive: item.isActive });
    setApiError('');
  };

  const openDelete = (item: ProductRegistration) => {
    setDeleteTarget(item);
    setApiError('');
  };

  const onCreateSubmit = (data: CreateForm) => {
    setApiError('');
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: EditForm) => {
    if (!editTarget) return;
    setApiError('');
    updateMutation.mutate({ id: editTarget.id, data });
  };

  const onDeleteConfirm = () => {
    if (!deleteTarget) return;
    setApiError('');
    deleteMutation.mutate(deleteTarget.id);
  };

  const handleApply = () => {
    setPage(0);
    setSelectedIds([]);
    setAppliedFilters({ productId, locationId, status });
  };

  const handleClear = () => {
    setProductId(''); setLocationId(''); setStatus('ALL');
    setPage(0);
    setSelectedIds([]);
    setAppliedFilters({ productId: '', locationId: '', status: 'ALL' });
  };

  const handlePageChange = (_e: unknown, p: number) => {
    setPage(p);
    setSelectedIds([]);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
    setSelectedIds([]);
  };

  // Selection helpers
  const allPageSelected =
    registrations.length > 0 && registrations.every((r) => selectedIds.includes(r.id));
  const somePageSelected =
    registrations.some((r) => selectedIds.includes(r.id)) && !allPageSelected;

  const handleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(registrations.map((r) => r.id));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkAction = (isActive: boolean) => {
    setBulkConfirm({ isActive });
  };

  const onBulkConfirm = () => {
    if (!bulkConfirm) return;
    bulkToggleMutation.mutate({ ids: selectedIds, isActive: bulkConfirm.isActive });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Product Registrations</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => { setCreateOpen(true); setApiError(''); }}
        >
          Register Product
        </Button>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Product</InputLabel>
            <Select
              label="Product"
              value={productId}
              onChange={(e: SelectChangeEvent) => setProductId(e.target.value)}
            >
              <MenuItem value="">All Products</MenuItem>
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.sku} — {p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Location</InputLabel>
            <Select
              label="Location"
              value={locationId}
              onChange={(e: SelectChangeEvent) => setLocationId(e.target.value)}
            >
              <MenuItem value="">All Locations</MenuItem>
              {locations.map((l) => (
                <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={status}
              onChange={(e: SelectChangeEvent) => setStatus(e.target.value)}
            >
              <MenuItem value="ALL">All</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
            </Select>
          </FormControl>

          <Button variant="outlined" startIcon={<FilterListIcon />} onClick={handleApply}>
            Apply
          </Button>
          <Button variant="text" onClick={handleClear}>
            Clear
          </Button>
        </Box>
      </Paper>

      {/* Bulk Action Toolbar — visible only when rows are selected */}
      {selectedIds.length > 0 && (
        <Paper sx={{ mb: 2 }}>
          <Toolbar sx={{ gap: 2 }}>
            <Typography sx={{ flex: 1 }} variant="body2">
              {selectedIds.length} selected
            </Typography>
            <Button
              variant="contained"
              size="small"
              disabled={bulkToggleMutation.isPending}
              onClick={() => handleBulkAction(true)}
            >
              Activate Selected
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={bulkToggleMutation.isPending}
              onClick={() => handleBulkAction(false)}
            >
              Deactivate Selected
            </Button>
          </Toolbar>
        </Paper>
      )}

      {/* Table */}
      {isLoading && <CircularProgress />}
      {error     && <Alert severity="error">Failed to load product registrations</Alert>}
      {!isLoading && !error && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={somePageSelected}
                      checked={allPageSelected}
                      onChange={handleSelectAll}
                      disabled={registrations.length === 0}
                    />
                  </TableCell>
                  <TableCell>Product (SKU)</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {registrations.map((item) => (
                  <TableRow
                    key={item.id}
                    selected={selectedIds.includes(item.id)}
                    hover
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelectRow(item.id)}
                      />
                    </TableCell>
                    <TableCell><strong>{item.product?.sku}</strong></TableCell>
                    <TableCell>{item.product?.name}</TableCell>
                    <TableCell>{item.location?.code} — {item.location?.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={item.isActive ? 'Active' : 'Inactive'}
                        color={item.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => openEdit(item)}
                        sx={{ mr: 1 }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => openDelete(item)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {registrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">No product registrations found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}

      {/* Create Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register Product at Location</DialogTitle>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            <Controller
              name="productId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Product"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {products.filter((p) => p.isActive).map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.sku} — {p.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="locationId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Location"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {locations.map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="isActive"
              control={createForm.control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={!!field.value} onChange={field.onChange} />}
                  label="Active"
                  sx={{ mt: 1 }}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Registration</DialogTitle>
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            {editTarget && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>{editTarget.product?.sku}</strong> — {editTarget.product?.name}
                {' '}at{' '}
                <strong>{editTarget.location?.code}</strong> — {editTarget.location?.name}
              </Typography>
            )}
            <Controller
              name="isActive"
              control={editForm.control}
              render={({ field }) => {
                const hasPending = deactivationCheck && !deactivationCheck.canDeactivate;
                const switchDisabled = !!hasPending && field.value === true;
                const tooltipTitle = hasPending
                  ? `Cannot deactivate: ${deactivationCheck.pendingCount} pending request(s) exist ` +
                    `(${deactivationCheck.adjustments} adjustment(s), ${deactivationCheck.transfers} transfer(s)). Resolve them first.`
                  : '';
                return (
                  <Tooltip title={tooltipTitle} arrow>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={field.onChange}
                          disabled={switchDisabled}
                        />
                      }
                      label="Active"
                      sx={{ mt: 1 }}
                    />
                  </Tooltip>
                );
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Registration</DialogTitle>
        <DialogContent>
          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
          {deleteTarget && (
            <Typography>
              Are you sure you want to delete the registration for{' '}
              <strong>{deleteTarget.product?.name}</strong> at{' '}
              <strong>{deleteTarget.location?.name}</strong>?
              <br /><br />
              This action is irreversible. If ledger entries exist, deletion will be blocked.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={onDeleteConfirm}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Toggle Confirmation Dialog */}
      <Dialog open={!!bulkConfirm} onClose={() => setBulkConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Bulk Action</DialogTitle>
        <DialogContent>
          <Typography>
            {bulkConfirm?.isActive
              ? `Activate ${selectedIds.length} selected item${selectedIds.length !== 1 ? 's' : ''}?`
              : `Deactivate ${selectedIds.length} selected item${selectedIds.length !== 1 ? 's' : ''}?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkConfirm(null)} disabled={bulkToggleMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onBulkConfirm}
            disabled={bulkToggleMutation.isPending}
          >
            {bulkToggleMutation.isPending ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
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

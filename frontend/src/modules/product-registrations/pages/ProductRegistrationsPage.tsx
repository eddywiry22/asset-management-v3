import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography, Paper, CircularProgress,
  Alert, MenuItem, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
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

  const { data: registrations = [], isLoading, error } = useQuery({
    queryKey: ['product-registrations'],
    queryFn:  productRegistrationsService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn:  productsService.getAll,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['all-locations'],
    queryFn:  stockService.getAllLocations,
  });

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

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">Failed to load product registrations</Alert>;

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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Product (SKU)</TableCell>
              <TableCell>Product Name</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {registrations.map((item) => (
              <TableRow key={item.id}>
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
                <TableCell colSpan={5} align="center">No product registrations found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
    </Box>
  );
}

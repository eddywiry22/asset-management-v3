import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography, Paper, CircularProgress,
  Alert, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { goodsService, Goods } from '../../../services/goods.service';
import { categoriesService } from '../../../services/categories.service';
import { vendorsService } from '../../../services/vendors.service';
import { uomsService } from '../../../services/uoms.service';

const createSchema = z.object({
  sku:        z.string().min(1, 'SKU is required'),
  name:       z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  vendorId:   z.string().min(1, 'Vendor is required'),
  uomId:      z.string().min(1, 'UOM is required'),
});

const editSchema = z.object({
  name:       z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  vendorId:   z.string().min(1, 'Vendor is required'),
  uomId:      z.string().min(1, 'UOM is required'),
  isActive:   z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

export default function GoodsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Goods | null>(null);
  const [apiError, setApiError] = useState('');

  const { data: goods = [], isLoading, error } = useQuery({
    queryKey: ['goods'],
    queryFn:  goodsService.getAll,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  categoriesService.getAll,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn:  vendorsService.getAll,
  });

  const { data: uoms = [] } = useQuery({
    queryKey: ['uoms'],
    queryFn:  uomsService.getAll,
  });

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: goodsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goods'] });
      setCreateOpen(false);
      createForm.reset();
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.message ?? 'Failed to create product');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) =>
      goodsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goods'] });
      setEditTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.message ?? 'Failed to update product');
    },
  });

  const openEdit = (item: Goods) => {
    setEditTarget(item);
    editForm.reset({
      name:       item.name,
      categoryId: item.categoryId,
      vendorId:   item.vendorId,
      uomId:      item.uomId,
      isActive:   item.isActive,
    });
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

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">Failed to load goods</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Goods (Products)</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setApiError(''); }}>
          Add Product
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell>UOM</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {goods.map((item) => (
              <TableRow key={item.id}>
                <TableCell><strong>{item.sku}</strong></TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.category?.name}</TableCell>
                <TableCell>{item.vendor?.name}</TableCell>
                <TableCell>{item.uom?.code}</TableCell>
                <TableCell>
                  <Chip
                    label={item.isActive ? 'Active' : 'Inactive'}
                    color={item.isActive ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {goods.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">No products found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Product</DialogTitle>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            <Controller
              name="sku"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} label="SKU" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message} />
              )}
            />
            <Controller
              name="name"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} label="Name" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message} />
              )}
            />
            <Controller
              name="categoryId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Category" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {categories.filter(c => c.isActive).map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="vendorId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Vendor" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {vendors.filter(v => v.isActive).map((v) => (
                    <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="uomId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Unit of Measurement" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {uoms.map((u) => (
                    <MenuItem key={u.id} value={u.id}>{u.code} — {u.name}</MenuItem>
                  ))}
                </TextField>
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
        <DialogTitle>Edit Product</DialogTitle>
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            <Controller
              name="name"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} label="Name" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message} />
              )}
            />
            <Controller
              name="categoryId"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Category" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {categories.filter(c => c.isActive).map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="vendorId"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Vendor" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {vendors.filter(v => v.isActive).map((v) => (
                    <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="uomId"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Unit of Measurement" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {uoms.map((u) => (
                    <MenuItem key={u.id} value={u.id}>{u.code} — {u.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="isActive"
              control={editForm.control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={field.onChange} />}
                  label="Active"
                  sx={{ mt: 1 }}
                />
              )}
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
    </Box>
  );
}

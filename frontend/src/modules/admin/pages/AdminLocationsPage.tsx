import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  adminLocationsService,
  AdminLocation,
} from '../../../services/adminLocations.service';

// ── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  code:    z.string().min(1, 'Code is required').max(50),
  name:    z.string().min(1, 'Name is required').max(100),
  address: z.string().max(255).optional(),
});

const editSchema = z.object({
  name:    z.string().min(1, 'Name is required').max(100),
  address: z.string().max(255).optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminLocationsPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [filterStatus, setFilterStatus]     = useState<StatusFilter>('ALL');
  const [appliedStatus, setAppliedStatus]   = useState<StatusFilter>('ALL');

  // Dialog state
  const [createOpen, setCreateOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<AdminLocation | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AdminLocation | null>(null);

  const [apiError, setApiError] = useState('');

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: locations = [], isLoading, error } = useQuery({
    queryKey: ['admin-locations', appliedStatus],
    queryFn:  () => adminLocationsService.getAll(appliedStatus),
  });

  // ── Forms ──────────────────────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: adminLocationsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-locations'] });
      setCreateOpen(false);
      createForm.reset();
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to create location');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) =>
      adminLocationsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-locations'] });
      setEditTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to update location');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => adminLocationsService.toggleActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-locations'] });
      setToggleTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to toggle location status');
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openEdit = (loc: AdminLocation) => {
    setEditTarget(loc);
    editForm.reset({ name: loc.name, address: loc.address ?? '' });
    setApiError('');
  };

  const openToggle = (loc: AdminLocation) => {
    setToggleTarget(loc);
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

  const onToggleConfirm = () => {
    if (!toggleTarget) return;
    setApiError('');
    toggleMutation.mutate(toggleTarget.id);
  };

  const applyFilter = () => setAppliedStatus(filterStatus);
  const clearFilter = () => {
    setFilterStatus('ALL');
    setAppliedStatus('ALL');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <CircularProgress />;
  if (error)     return <Alert severity="error">Failed to load locations</Alert>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Locations</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => { setCreateOpen(true); setApiError(''); }}
        >
          Add Location
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select
            label="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          >
            <MenuItem value="ALL">All</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" size="small" onClick={applyFilter}>Apply</Button>
        <Button variant="outlined" size="small" onClick={clearFilter}>Clear</Button>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {locations.map((loc) => {
              const blocked = loc.isActive && loc.blockingRequestCount > 0;
              const toggleTooltip = blocked
                ? `Cannot deactivate — ${loc.blockingRequestCount} pending request(s)`
                : loc.isActive ? 'Deactivate' : 'Activate';

              return (
                <TableRow key={loc.id}>
                  <TableCell><strong>{loc.code}</strong></TableCell>
                  <TableCell>{loc.name}</TableCell>
                  <TableCell>{loc.address ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={loc.isActive ? 'Active' : 'Inactive'}
                      color={loc.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => openEdit(loc)}
                      sx={{ mr: 1 }}
                    >
                      Edit
                    </Button>
                    <Tooltip title={toggleTooltip} arrow>
                      <span>
                        <Switch
                          size="small"
                          checked={loc.isActive}
                          disabled={blocked}
                          onChange={() => openToggle(loc)}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {locations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">No locations found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Location</DialogTitle>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            <Controller
              name="code"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Code"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="name"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Name"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="address"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Address (optional)"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setCreateOpen(false); createForm.reset(); }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Location</DialogTitle>
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            {editTarget && (
              <TextField
                label="Code"
                value={editTarget.code}
                fullWidth
                margin="normal"
                disabled
                helperText="Code cannot be changed after creation"
              />
            )}
            <Controller
              name="name"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Name"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="address"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Address (optional)"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
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

      {/* Toggle Active Confirmation Dialog */}
      <Dialog open={!!toggleTarget} onClose={() => setToggleTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {toggleTarget?.isActive ? 'Deactivate Location' : 'Activate Location'}
        </DialogTitle>
        <DialogContent>
          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
          {toggleTarget && (
            <Typography>
              Are you sure you want to{' '}
              <strong>{toggleTarget.isActive ? 'deactivate' : 'activate'}</strong>{' '}
              location <strong>{toggleTarget.code} — {toggleTarget.name}</strong>?
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToggleTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={toggleTarget?.isActive ? 'error' : 'success'}
            onClick={onToggleConfirm}
            disabled={toggleMutation.isPending}
          >
            {toggleMutation.isPending ? 'Processing...' : (toggleTarget?.isActive ? 'Deactivate' : 'Activate')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

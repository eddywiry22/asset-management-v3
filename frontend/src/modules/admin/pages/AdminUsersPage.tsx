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
  FormHelperText,
  InputLabel,
  MenuItem,
  OutlinedInput,
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
  adminUsersService,
  AdminUser,
  StatusFilter,
  UserRole,
} from '../../../services/adminUsers.service';
import { adminLocationsService } from '../../../services/adminLocations.service';

// ── Schemas ──────────────────────────────────────────────────────────────────

const roleValues = ['OPERATOR', 'MANAGER'] as const;

const createSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(roleValues, { error: 'Role is required' }),
  locationIds: z.array(z.string()).default([]),
});

const editSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  role: z.enum(roleValues).optional(),
  locationIds: z.array(z.string()).optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('ALL');
  const [filterRole, setFilterRole]     = useState<UserRole | ''>('');
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter>('ALL');
  const [appliedRole, setAppliedRole]     = useState<UserRole | ''>('');

  // Dialog state
  const [createOpen, setCreateOpen]       = useState(false);
  const [editTarget, setEditTarget]       = useState<AdminUser | null>(null);
  const [toggleTarget, setToggleTarget]   = useState<AdminUser | null>(null);

  const [apiError, setApiError] = useState('');

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin-users', appliedStatus, appliedRole],
    queryFn:  () => adminUsersService.getAll(appliedStatus, appliedRole || undefined),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['admin-locations', 'ACTIVE'],
    queryFn:  () => adminLocationsService.getAll('ACTIVE'),
  });

  // ── Forms ──────────────────────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) =>
      adminUsersService.create({
        username: data.username,
        email: data.email || null,
        phone: data.phone || null,
        password: data.password,
        role: data.role,
        locationIds: data.locationIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setCreateOpen(false);
      createForm.reset();
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to create user');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) =>
      adminUsersService.update(id, {
        username: data.username,
        email: data.email || null,
        phone: data.phone || null,
        role: data.role,
        locationIds: data.locationIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to update user');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => adminUsersService.toggleActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setToggleTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to toggle user status');
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openEdit = (user: AdminUser) => {
    setEditTarget(user);
    const primaryRole = user.assignedLocations[0]?.role as UserRole | undefined;
    editForm.reset({
      username:    user.username,
      email:       user.email ?? '',
      phone:       user.phone ?? '',
      role:        primaryRole,
      locationIds: user.assignedLocations.map((l) => l.locationId),
    });
    setApiError('');
  };

  const openToggle = (user: AdminUser) => {
    setToggleTarget(user);
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

  const applyFilter = () => {
    setAppliedStatus(filterStatus);
    setAppliedRole(filterRole);
  };
  const clearFilter = () => {
    setFilterStatus('ALL');
    setFilterRole('');
    setAppliedStatus('ALL');
    setAppliedRole('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <CircularProgress />;
  if (error)     return <Alert severity="error">Failed to load users</Alert>;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Users</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => { setCreateOpen(true); setApiError(''); createForm.reset(); }}
        >
          Add User
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Role</InputLabel>
          <Select
            label="Role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as UserRole | '')}
          >
            <MenuItem value="">All Roles</MenuItem>
            <MenuItem value="OPERATOR">Operator</MenuItem>
            <MenuItem value="MANAGER">Manager</MenuItem>
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
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Locations</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => {
              const primaryRole = user.assignedLocations[0]?.role;
              return (
                <TableRow key={user.id}>
                  <TableCell><strong>{user.username}</strong></TableCell>
                  <TableCell>{user.email ?? '—'}</TableCell>
                  <TableCell>{user.phone ?? '—'}</TableCell>
                  <TableCell>
                    {primaryRole ? (
                      <Chip
                        label={primaryRole}
                        color={primaryRole === 'MANAGER' ? 'primary' : 'default'}
                        size="small"
                      />
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {user.assignedLocations.length === 0
                        ? '—'
                        : user.assignedLocations.map((loc) => (
                            <Chip
                              key={loc.locationId}
                              label={loc.locationCode}
                              size="small"
                              variant="outlined"
                              color={loc.isActive ? 'default' : 'warning'}
                            />
                          ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.isActive ? 'Active' : 'Inactive'}
                      color={user.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => openEdit(user)}
                      sx={{ mr: 1 }}
                    >
                      Edit
                    </Button>
                    <Tooltip title={user.isActive ? 'Deactivate' : 'Activate'} arrow>
                      <span>
                        <Switch
                          size="small"
                          checked={user.isActive}
                          onChange={() => openToggle(user)}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">No users found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add User</DialogTitle>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}

            <Controller
              name="username"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Username"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="email"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Email (optional)"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="phone"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Phone (optional)"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="password"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  type="password"
                  label="Password"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />

            <Controller
              name="role"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <FormControl fullWidth margin="normal" error={!!fieldState.error}>
                  <InputLabel>Role</InputLabel>
                  <Select {...field} label="Role">
                    <MenuItem value="OPERATOR">Operator</MenuItem>
                    <MenuItem value="MANAGER">Manager</MenuItem>
                  </Select>
                  {fieldState.error && (
                    <FormHelperText>{fieldState.error.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="locationIds"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <FormControl fullWidth margin="normal" error={!!fieldState.error}>
                  <InputLabel>Locations</InputLabel>
                  <Select
                    multiple
                    {...field}
                    input={<OutlinedInput label="Locations" />}
                    renderValue={(selected) =>
                      (selected as string[])
                        .map((id) => locations.find((l) => l.id === id)?.code ?? id)
                        .join(', ')
                    }
                  >
                    {locations.map((loc) => (
                      <MenuItem key={loc.id} value={loc.id}>
                        {loc.code} — {loc.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {fieldState.error && (
                    <FormHelperText>{fieldState.error.message}</FormHelperText>
                  )}
                </FormControl>
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

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}

            <Controller
              name="username"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Username"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="email"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Email (optional)"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="phone"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Phone (optional)"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />

            <Controller
              name="role"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <FormControl fullWidth margin="normal" error={!!fieldState.error}>
                  <InputLabel>Role</InputLabel>
                  <Select {...field} label="Role">
                    <MenuItem value="OPERATOR">Operator</MenuItem>
                    <MenuItem value="MANAGER">Manager</MenuItem>
                  </Select>
                  {fieldState.error && (
                    <FormHelperText>{fieldState.error.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="locationIds"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <FormControl fullWidth margin="normal" error={!!fieldState.error}>
                  <InputLabel>Locations</InputLabel>
                  <Select
                    multiple
                    {...field}
                    value={field.value ?? []}
                    input={<OutlinedInput label="Locations" />}
                    renderValue={(selected) =>
                      (selected as string[])
                        .map((id) => locations.find((l) => l.id === id)?.code ?? id)
                        .join(', ')
                    }
                  >
                    {locations.map((loc) => (
                      <MenuItem key={loc.id} value={loc.id}>
                        {loc.code} — {loc.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {fieldState.error && (
                    <FormHelperText>{fieldState.error.message}</FormHelperText>
                  )}
                </FormControl>
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

      {/* ── Toggle Active Confirmation Dialog ── */}
      <Dialog open={!!toggleTarget} onClose={() => setToggleTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {toggleTarget?.isActive ? 'Deactivate User' : 'Activate User'}
        </DialogTitle>
        <DialogContent>
          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
          {toggleTarget && (
            <Typography>
              Are you sure you want to{' '}
              <strong>{toggleTarget.isActive ? 'deactivate' : 'activate'}</strong>{' '}
              user <strong>{toggleTarget.username}</strong>?
              {toggleTarget.isActive && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Inactive users will not be able to log in.
                </Typography>
              )}
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
            {toggleMutation.isPending
              ? 'Processing...'
              : toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

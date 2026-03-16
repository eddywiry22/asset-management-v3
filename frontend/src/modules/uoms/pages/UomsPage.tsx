import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Paper, CircularProgress, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { uomsService } from '../../../services/uoms.service';

const createSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
});

type CreateForm = z.infer<typeof createSchema>;

export default function UomsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [apiError, setApiError] = useState('');

  const { data: uoms = [], isLoading, error } = useQuery({
    queryKey: ['uoms'],
    queryFn:  uomsService.getAll,
  });

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const createMutation = useMutation({
    mutationFn: uomsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uoms'] });
      setCreateOpen(false);
      createForm.reset();
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.message ?? 'Failed to create UOM');
    },
  });

  const onCreateSubmit = (data: CreateForm) => {
    setApiError('');
    createMutation.mutate({ ...data, code: data.code.toUpperCase() });
  };

  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">Failed to load UOMs</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Units of Measurement</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setApiError(''); }}>
          Add UOM
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {uoms.map((uom) => (
              <TableRow key={uom.id}>
                <TableCell><strong>{uom.code}</strong></TableCell>
                <TableCell>{uom.name}</TableCell>
              </TableRow>
            ))}
            {uoms.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} align="center">No UOMs found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Unit of Measurement</DialogTitle>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            <Controller
              name="code"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Code (e.g. PCS, BOX, KG)"
                  fullWidth
                  margin="normal"
                  inputProps={{ style: { textTransform: 'uppercase' } }}
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
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}

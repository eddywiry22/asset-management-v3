import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

type SaveFilterModalProps = {
  open:    boolean;
  onClose: () => void;
  onSave:  (name: string) => void;
};

export default function SaveFilterModal({ open, onClose, onSave }: SaveFilterModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    onSave(trimmed);
    setName('');
    setError('');
  }

  function handleClose() {
    setName('');
    setError('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Save Filter</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Filter Name"
          fullWidth
          size="small"
          sx={{ mt: 1 }}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          error={!!error}
          helperText={error}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

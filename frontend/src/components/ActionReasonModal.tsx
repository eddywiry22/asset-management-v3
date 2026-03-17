import { useState, useEffect } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, TextField,
} from '@mui/material';

type Props = {
  open: boolean;
  type: 'reject' | 'cancel';
  title: string;
  confirmLabel: string;
  loading?: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
};

/**
 * Shared modal for reject / cancel actions that require a non-empty reason.
 * Used by both StockAdjustmentDetailPage and StockTransferDetailPage.
 */
export default function ActionReasonModal({
  open, type, title, confirmLabel, loading = false, onSubmit, onClose,
}: Props) {
  const [reason, setReason] = useState('');

  // Reset reason when dialog opens/closes
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const handleClose = () => {
    setReason('');
    onClose();
  };

  const handleSubmit = () => {
    if (!reason.trim() || loading) return;
    onSubmit(reason.trim());
  };

  const label = type === 'reject' ? 'Rejection Reason' : 'Cancellation Reason';
  const isEmpty = reason.trim() === '';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {type === 'reject'
            ? 'Rejecting is permanent and cannot be undone.'
            : 'Cancelling is permanent and cannot be undone.'}
        </Alert>
        <TextField
          label={label}
          multiline
          rows={3}
          fullWidth
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={isEmpty}
          helperText={isEmpty ? 'A reason is required' : ''}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          disabled={isEmpty || loading}
          onClick={handleSubmit}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

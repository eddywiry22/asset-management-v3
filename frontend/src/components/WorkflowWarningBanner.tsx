import { Alert } from '@mui/material';

interface Props {
  message: string;
  severity?: 'warning' | 'error';
}

/**
 * Standardized workflow warning banner used across Transfer and Adjustment
 * detail pages to communicate missing active users or role gaps.
 */
export function WorkflowWarningBanner({ message, severity = 'warning' }: Props) {
  return (
    <Alert severity={severity} sx={{ mb: 2 }}>
      {message}
    </Alert>
  );
}

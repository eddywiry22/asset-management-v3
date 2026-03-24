import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import type { PreviewItem, PreviewType, PreviewFilter } from '../../services/dashboard.service';

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  DRAFT: 'default',
  SUBMITTED: 'warning',
  APPROVED: 'info',
  REJECTED: 'error',
  FINALIZED: 'success',
  CANCELLED: 'error',
  ORIGIN_MANAGER_APPROVED: 'warning',
  DESTINATION_OPERATOR_APPROVED: 'warning',
  READY_TO_FINALIZE: 'warning',
};

const FILTER_LABELS: Record<PreviewFilter, string> = {
  REQUIRING_ACTION: 'Requiring Action',
  IN_PROGRESS: 'In Progress',
  READY_TO_FINALIZE: 'Ready to Finalize',
  ARRIVING: 'Arriving',
};

interface Props {
  type: PreviewType;
  filter: PreviewFilter;
  data: PreviewItem[];
  isLoading: boolean;
  onClose: () => void;
}

export default function DashboardPreviewTable({ type, filter, data, isLoading, onClose }: Props) {
  const navigate = useNavigate();

  const isAdjustment = type === 'ADJUSTMENT';
  const columnCount = isAdjustment ? 5 : 6;

  function handleViewAll() {
    if (isAdjustment) {
      navigate('/stock-adjustments');
    } else {
      navigate('/stock-transfers');
    }
  }

  function handleRowClick(id: string) {
    if (isAdjustment) {
      navigate(`/stock-adjustments/${id}`);
    } else {
      navigate(`/stock-transfers/${id}`);
    }
  }

  return (
    <Paper sx={{ mt: 3, p: 2 }}>
      {/* Header row */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
        <Typography variant="subtitle1" fontWeight={600}>
          Showing {FILTER_LABELS[filter]} {isAdjustment ? 'adjustment' : 'transfer'} requests
        </Typography>
        <Box display="flex" alignItems="center" gap={1}>
          <Button variant="outlined" size="small" onClick={handleViewAll}>
            View All
          </Button>
          <Tooltip title="Close">
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Request #</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell>Created By</TableCell>
              {isAdjustment ? (
                <TableCell>Location</TableCell>
              ) : (
                <>
                  <TableCell>Origin</TableCell>
                  <TableCell>Destination</TableCell>
                </>
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columnCount }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton animation="wave" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No requests found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => handleRowClick(row.id)}
                >
                  <TableCell>{row.requestNumber}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.status.replace(/_/g, ' ')}
                      color={STATUS_COLORS[row.status] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{row.createdBy.name}</TableCell>
                  {isAdjustment ? (
                    <TableCell>{row.location ? `${row.location.code} — ${row.location.name}` : '—'}</TableCell>
                  ) : (
                    <>
                      <TableCell>{row.origin ? `${row.origin.code} — ${row.origin.name}` : '—'}</TableCell>
                      <TableCell>
                        {row.destination ? `${row.destination.code} — ${row.destination.name}` : '—'}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

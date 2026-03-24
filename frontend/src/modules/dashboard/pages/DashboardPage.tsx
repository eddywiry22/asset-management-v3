import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, CircularProgress, Grid, Typography } from '@mui/material';
import { useAuth } from '../../../context/AuthContext';
import { getMyDashboard } from '../../../services/dashboard.service';
import MetricCard from '../../../components/dashboard/MetricCard';

type PreviewFilter =
  | { type: 'adjustment'; filter: 'needsApproval' | 'readyToFinalize' | 'inProgress' }
  | { type: 'movement'; filter: 'originApproval' | 'destinationApproval' | 'incoming' | 'readyToFinalize' }
  | null;

export default function DashboardPage() {
  const { user } = useAuth();
  const [_preview, setPreview] = useState<PreviewFilter>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getMyDashboard,
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  const displayName = user?.email ?? user?.phone ?? 'there';

  return (
    <Box p={2}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={600}>
          Welcome back, {displayName} 👋
        </Typography>
        <Typography variant="h6" color="error" fontWeight={600} mt={0.5}>
          {data?.summary.pendingActions ?? 0} actions require your attention
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {data?.summary.incomingTransfers ?? 0} incoming transfer
          {(data?.summary.incomingTransfers ?? 0) !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Adjustments */}
      <Typography variant="h6" mb={1}>
        Adjustments
      </Typography>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={4}>
          <MetricCard
            label="Needs Approval"
            value={data?.adjustments.needsApproval ?? 0}
            color="error"
            onClick={() => setPreview({ type: 'adjustment', filter: 'needsApproval' })}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <MetricCard
            label="Ready to Finalize"
            value={data?.adjustments.readyToFinalize ?? 0}
            color="warning"
            onClick={() => setPreview({ type: 'adjustment', filter: 'readyToFinalize' })}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <MetricCard
            label="In Progress"
            value={data?.adjustments.inProgress ?? 0}
            color="info"
            onClick={() => setPreview({ type: 'adjustment', filter: 'inProgress' })}
          />
        </Grid>
      </Grid>

      {/* Transfers */}
      <Typography variant="h6" mb={1}>
        Transfers
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Origin Approval"
            value={data?.movements.needsOriginApproval ?? 0}
            color="error"
            onClick={() => setPreview({ type: 'movement', filter: 'originApproval' })}
          />
        </Grid>

        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Destination Approval"
            value={data?.movements.needsDestinationApproval ?? 0}
            color="error"
            onClick={() => setPreview({ type: 'movement', filter: 'destinationApproval' })}
          />
        </Grid>

        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Incoming"
            value={data?.movements.incoming ?? 0}
            color="info"
            onClick={() => setPreview({ type: 'movement', filter: 'incoming' })}
          />
        </Grid>

        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Ready to Finalize"
            value={data?.movements.readyToFinalize ?? 0}
            color="warning"
            onClick={() => setPreview({ type: 'movement', filter: 'readyToFinalize' })}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

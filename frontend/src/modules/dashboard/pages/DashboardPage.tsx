import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, CircularProgress, Grid, Typography } from '@mui/material';
import { useAuth } from '../../../context/AuthContext';
import {
  getMyDashboard,
  getPreview,
  type PreviewType,
  type PreviewFilter,
} from '../../../services/dashboard.service';
import MetricCard from '../../../components/dashboard/MetricCard';
import DashboardPreviewTable from '../../../components/dashboard/DashboardPreviewTable';

interface PreviewParams {
  type: PreviewType;
  filter: PreviewFilter;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [previewParams, setPreviewParams] = useState<PreviewParams | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getMyDashboard,
  });

  const { data: previewData = [], isLoading: previewLoading } = useQuery({
    queryKey: ['dashboard-preview', previewParams],
    queryFn: () => getPreview(previewParams!),
    enabled: !!previewParams,
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
            onClick={() => setPreviewParams({ type: 'ADJUSTMENT', filter: 'REQUIRING_ACTION' })}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <MetricCard
            label="Ready to Finalize"
            value={data?.adjustments.readyToFinalize ?? 0}
            color="warning"
            onClick={() => setPreviewParams({ type: 'ADJUSTMENT', filter: 'READY_TO_FINALIZE' })}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <MetricCard
            label="In Progress"
            value={data?.adjustments.inProgress ?? 0}
            color="info"
            onClick={() => setPreviewParams({ type: 'ADJUSTMENT', filter: 'IN_PROGRESS' })}
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
            onClick={() => setPreviewParams({ type: 'TRANSFER', filter: 'REQUIRING_ACTION' })}
          />
        </Grid>

        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Destination Approval"
            value={data?.movements.needsDestinationApproval ?? 0}
            color="error"
            onClick={() => setPreviewParams({ type: 'TRANSFER', filter: 'REQUIRING_ACTION' })}
          />
        </Grid>

        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Incoming"
            value={data?.movements.incoming ?? 0}
            color="info"
            onClick={() => setPreviewParams({ type: 'TRANSFER', filter: 'ARRIVING' })}
          />
        </Grid>

        <Grid item xs={12} sm={3}>
          <MetricCard
            label="Ready to Finalize"
            value={data?.movements.readyToFinalize ?? 0}
            color="warning"
            onClick={() => setPreviewParams({ type: 'TRANSFER', filter: 'READY_TO_FINALIZE' })}
          />
        </Grid>
      </Grid>

      {/* Preview table */}
      {previewParams && (
        <DashboardPreviewTable
          type={previewParams.type}
          filter={previewParams.filter}
          data={previewData}
          isLoading={previewLoading}
          onClose={() => setPreviewParams(null)}
        />
      )}
    </Box>
  );
}

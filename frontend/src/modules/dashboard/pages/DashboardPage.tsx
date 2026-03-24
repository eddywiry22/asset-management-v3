import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
} from '@mui/material';
import { useAuth } from '../../../context/AuthContext';
import { getMyDashboard } from '../../../services/dashboard.service';

type PreviewFilter =
  | { type: 'adjustment'; filter: 'needsApproval' | 'readyToFinalize' | 'inProgress' }
  | { type: 'movement'; filter: 'needsOriginApproval' | 'needsDestinationApproval' | 'incoming' | 'readyToFinalize' }
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
    <Box p={3}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={600}>
          Welcome back, {displayName} 👋
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          You have{' '}
          <strong>{data?.summary.pendingActions ?? 0}</strong> pending action
          {(data?.summary.pendingActions ?? 0) !== 1 ? 's' : ''} &nbsp;·&nbsp;{' '}
          <strong>{data?.summary.incomingTransfers ?? 0}</strong> incoming transfer
          {(data?.summary.incomingTransfers ?? 0) !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Action Cards */}
      <Grid container spacing={2}>
        {/* Adjustments Card */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Adjustments
              </Typography>

              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'adjustment', filter: 'needsApproval' })}
                >
                  Needs Approval:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.adjustments.needsApproval ?? 0}
                  </Box>
                </Button>

                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'adjustment', filter: 'readyToFinalize' })}
                >
                  Ready to Finalize:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.adjustments.readyToFinalize ?? 0}
                  </Box>
                </Button>

                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'adjustment', filter: 'inProgress' })}
                >
                  In Progress:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.adjustments.inProgress ?? 0}
                  </Box>
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Transfers Card */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Transfers
              </Typography>

              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'movement', filter: 'needsOriginApproval' })}
                >
                  Origin Approval:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.movements.needsOriginApproval ?? 0}
                  </Box>
                </Button>

                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'movement', filter: 'needsDestinationApproval' })}
                >
                  Destination Approval:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.movements.needsDestinationApproval ?? 0}
                  </Box>
                </Button>

                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'movement', filter: 'incoming' })}
                >
                  Incoming:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.movements.incoming ?? 0}
                  </Box>
                </Button>

                <Button
                  variant="text"
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => setPreview({ type: 'movement', filter: 'readyToFinalize' })}
                >
                  Ready to Finalize:{' '}
                  <Box component="span" fontWeight={700} ml={0.5}>
                    {data?.movements.readyToFinalize ?? 0}
                  </Box>
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

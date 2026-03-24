import apiClient from '../api/client';

export interface DashboardResponse {
  summary: {
    pendingActions: number;
    incomingTransfers: number;
  };
  adjustments: {
    needsApproval: number;
    readyToFinalize: number;
    inProgress: number;
  };
  movements: {
    needsOriginApproval: number;
    needsDestinationApproval: number;
    incoming: number;
    readyToFinalize: number;
  };
}

export async function getMyDashboard(): Promise<DashboardResponse> {
  const res = await apiClient.get<{ success: boolean; data: DashboardResponse }>('/dashboard/my-actions');
  return res.data.data;
}

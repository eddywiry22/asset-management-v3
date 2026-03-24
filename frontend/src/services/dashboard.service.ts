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

export type PreviewType = 'ADJUSTMENT' | 'TRANSFER';
export type PreviewFilter = 'REQUIRING_ACTION' | 'IN_PROGRESS' | 'READY_TO_FINALIZE' | 'ARRIVING';

export interface PreviewLocation {
  id: string;
  code: string;
  name: string;
}

export interface PreviewItem {
  id: string;
  type: PreviewType;
  requestNumber: string;
  status: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  location?: PreviewLocation;
  origin?: PreviewLocation;
  destination?: PreviewLocation;
}

export interface DashboardPreviewParams {
  type: PreviewType;
  filter: PreviewFilter;
  limit?: number;
}

export async function getPreview(params: DashboardPreviewParams): Promise<PreviewItem[]> {
  const res = await apiClient.get<{ success: boolean; data: PreviewItem[] }>('/dashboard/preview', { params });
  return res.data.data;
}

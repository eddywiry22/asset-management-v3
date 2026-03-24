export interface PreviewLocation {
  id: string;
  code: string;
  name: string;
}

export interface PreviewItem {
  id: string;
  type: 'ADJUSTMENT' | 'TRANSFER';
  requestNumber: string;
  status: string;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
  };
  location?: PreviewLocation;
  origin?: PreviewLocation;
  destination?: PreviewLocation;
}

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

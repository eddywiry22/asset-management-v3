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

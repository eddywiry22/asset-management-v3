/**
 * Standardized workflow warning messages for Transfer and Adjustment modules.
 * Only active users are considered by the backend readiness checks that drive
 * these warnings.
 */
export const WORKFLOW_WARNINGS = {
  transferDestinationMissingUsers:
    'Destination location is missing required active users (OPERATOR and/or MANAGER). This transfer may not be completable. Contact admin.',

  adjustmentMissingManagers:
    'Item location(s) have no assigned active manager(s). This adjustment cannot be approved until a manager is assigned.',
} as const;

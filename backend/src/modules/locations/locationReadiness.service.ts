import prisma from '../../config/database';

export type LocationReadiness = {
  hasOperator: boolean;
  hasManager: boolean;
  adjustmentReady: boolean;
  transferOutboundReady: boolean;
  transferInboundReady: boolean;
  overallStatus: 'FULL' | 'PARTIAL' | 'NONE';
};

/**
 * Evaluates the operational readiness of a location based on ACTIVE assigned users.
 * Inactive users are excluded so deactivation immediately reflects in readiness status.
 *
 * FULL    → has at least one active OPERATOR and one active MANAGER
 * PARTIAL → has one active role but not both
 * NONE    → no active users assigned
 */
export async function evaluateLocationReadiness(locationId: string): Promise<LocationReadiness> {
  const roles = await prisma.userLocationRole.findMany({
    where: { locationId, user: { isActive: true } },
    select: { role: true },
  });

  const hasOperator = roles.some((r: { role: string }) => r.role === 'OPERATOR');
  const hasManager  = roles.some((r: { role: string }) => r.role === 'MANAGER');

  return {
    hasOperator,
    hasManager,
    adjustmentReady:       hasOperator && hasManager,
    transferOutboundReady: hasManager,
    transferInboundReady:  hasOperator || hasManager,
    overallStatus:
      hasOperator && hasManager
        ? 'FULL'
        : hasOperator || hasManager
        ? 'PARTIAL'
        : 'NONE',
  };
}

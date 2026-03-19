import prisma from '../../config/database';

export type LocationReadiness = {
  hasOperator: boolean;
  hasManager: boolean;
  adjustmentReady: boolean;
  transferOutboundReady: boolean;
  transferInboundReady: boolean;
  overallStatus: 'FULL' | 'PARTIAL' | 'NONE';
};

export async function evaluateLocationReadiness(locationId: string): Promise<LocationReadiness> {
  const roles = await prisma.userLocationRole.findMany({ where: { locationId } });

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

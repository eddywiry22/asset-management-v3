import prisma from '../../config/database';
import logger from '../../utils/logger';
import { DashboardResponse } from './dashboard.types';
import { Role } from '@prisma/client';

export async function getDashboardData(userId: string, isAdmin: boolean): Promise<DashboardResponse> {
  logger.info({ userId }, 'Fetching dashboard data');

  // Admin users don't have location roles — return all zeros
  if (isAdmin) {
    return {
      summary: { pendingActions: 0, incomingTransfers: 0 },
      adjustments: { needsApproval: 0, readyToFinalize: 0, inProgress: 0 },
      movements: { needsOriginApproval: 0, needsDestinationApproval: 0, incoming: 0, readyToFinalize: 0 },
    };
  }

  const roles = await prisma.userLocationRole.findMany({
    where: { userId },
    select: { locationId: true, role: true },
  });

  const locationIds = roles.map((r: { locationId: string; role: Role }) => r.locationId);
  const managerLocationIds = roles
    .filter((r: { locationId: string; role: Role }) => r.role === Role.MANAGER)
    .map((r: { locationId: string; role: Role }) => r.locationId);
  const operatorLocationIds = roles
    .filter((r: { locationId: string; role: Role }) => r.role === Role.OPERATOR)
    .map((r: { locationId: string; role: Role }) => r.locationId);

  // =====================
  // ADJUSTMENTS
  // StockAdjustmentRequest has no direct locationId — filter via items
  // Status mapping: SUBMITTED → needs manager approval, APPROVED → ready to finalize
  // =====================

  const [adjNeedsApproval, adjReadyToFinalize, adjInProgress] = await Promise.all([
    // Managers: adjustments submitted that touch their locations
    managerLocationIds.length > 0
      ? prisma.stockAdjustmentRequest.count({
          where: {
            status: 'SUBMITTED',
            items: { some: { locationId: { in: managerLocationIds } } },
          },
        })
      : Promise.resolve(0),

    // Operators: adjustments approved (manager-approved) that touch their locations
    operatorLocationIds.length > 0
      ? prisma.stockAdjustmentRequest.count({
          where: {
            status: 'APPROVED',
            items: { some: { locationId: { in: operatorLocationIds } } },
          },
        })
      : Promise.resolve(0),

    // All user locations: adjustments in active workflow states
    locationIds.length > 0
      ? prisma.stockAdjustmentRequest.count({
          where: {
            status: { in: ['SUBMITTED', 'APPROVED'] },
            items: { some: { locationId: { in: locationIds } } },
          },
        })
      : Promise.resolve(0),
  ]);

  // =====================
  // MOVEMENTS (StockTransferRequest)
  // sourceLocationId = origin, destinationLocationId = destination
  // =====================

  const [movNeedsOriginApproval, movNeedsDestinationApproval, movIncoming, movReadyToFinalize] =
    await Promise.all([
      // Managers at origin: transfers submitted and awaiting origin approval
      managerLocationIds.length > 0
        ? prisma.stockTransferRequest.count({
            where: {
              sourceLocationId: { in: managerLocationIds },
              status: 'SUBMITTED',
            },
          })
        : Promise.resolve(0),

      // Operators at destination: transfers origin-approved, awaiting destination approval
      operatorLocationIds.length > 0
        ? prisma.stockTransferRequest.count({
            where: {
              destinationLocationId: { in: operatorLocationIds },
              status: 'ORIGIN_MANAGER_APPROVED',
            },
          })
        : Promise.resolve(0),

      // All user locations as destination: in-transit transfers
      locationIds.length > 0
        ? prisma.stockTransferRequest.count({
            where: {
              destinationLocationId: { in: locationIds },
              status: {
                in: ['ORIGIN_MANAGER_APPROVED', 'DESTINATION_OPERATOR_APPROVED', 'READY_TO_FINALIZE'],
              },
            },
          })
        : Promise.resolve(0),

      // Operators at destination: transfers ready to finalize
      operatorLocationIds.length > 0
        ? prisma.stockTransferRequest.count({
            where: {
              destinationLocationId: { in: operatorLocationIds },
              status: 'READY_TO_FINALIZE',
            },
          })
        : Promise.resolve(0),
    ]);

  // =====================
  // SUMMARY
  // =====================

  const pendingActions =
    adjNeedsApproval +
    adjReadyToFinalize +
    movNeedsOriginApproval +
    movNeedsDestinationApproval +
    movReadyToFinalize;

  return {
    summary: {
      pendingActions,
      incomingTransfers: movIncoming,
    },
    adjustments: {
      needsApproval: adjNeedsApproval,
      readyToFinalize: adjReadyToFinalize,
      inProgress: adjInProgress,
    },
    movements: {
      needsOriginApproval: movNeedsOriginApproval,
      needsDestinationApproval: movNeedsDestinationApproval,
      incoming: movIncoming,
      readyToFinalize: movReadyToFinalize,
    },
  };
}

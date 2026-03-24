import prisma from '../../config/database';
import logger from '../../utils/logger';
import { DashboardResponse, PreviewItem, PreviewLocation } from './dashboard.types';
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

// ---------------------------------------------------------------------------
// Dashboard Preview
// ---------------------------------------------------------------------------

interface LocationSets {
  locationIds: string[];
  managerLocationIds: string[];
  operatorLocationIds: string[];
}

async function resolveUserLocations(userId: string, isAdmin: boolean): Promise<LocationSets> {
  if (isAdmin) {
    const allLocations = await prisma.location.findMany({ select: { id: true } });
    const allIds = allLocations.map((l: { id: string }) => l.id);
    return { locationIds: allIds, managerLocationIds: allIds, operatorLocationIds: allIds };
  }

  const roles = await prisma.userLocationRole.findMany({
    where: { userId },
    select: { locationId: true, role: true },
  });

  return {
    locationIds: roles.map((r: { locationId: string; role: Role }) => r.locationId),
    managerLocationIds: roles
      .filter((r: { locationId: string; role: Role }) => r.role === Role.MANAGER)
      .map((r: { locationId: string; role: Role }) => r.locationId),
    operatorLocationIds: roles
      .filter((r: { locationId: string; role: Role }) => r.role === Role.OPERATOR)
      .map((r: { locationId: string; role: Role }) => r.locationId),
  };
}

type AdjustmentPreviewRecord = {
  id: string;
  requestNumber: string;
  status: string;
  createdAt: Date;
  createdBy: { id: string; username: string };
  items: Array<{ locationId: string; location: PreviewLocation }>;
};

type TransferPreviewRecord = {
  id: string;
  requestNumber: string;
  status: string;
  createdAt: Date;
  createdBy: { id: string; username: string };
  sourceLocation: PreviewLocation;
  destinationLocation: PreviewLocation;
};

function mapToPreviewItem(entity: AdjustmentPreviewRecord, type: 'ADJUSTMENT'): PreviewItem;
function mapToPreviewItem(entity: TransferPreviewRecord, type: 'TRANSFER'): PreviewItem;
function mapToPreviewItem(
  entity: AdjustmentPreviewRecord | TransferPreviewRecord,
  type: 'ADJUSTMENT' | 'TRANSFER',
): PreviewItem {
  const base = {
    id: entity.id,
    type,
    requestNumber: entity.requestNumber,
    status: entity.status,
    createdAt: entity.createdAt,
    createdBy: { id: entity.createdBy.id, name: entity.createdBy.username },
  };

  if (type === 'ADJUSTMENT') {
    const adj = entity as AdjustmentPreviewRecord;
    return { ...base, location: adj.items[0]?.location };
  } else {
    const trx = entity as TransferPreviewRecord;
    return { ...base, origin: trx.sourceLocation, destination: trx.destinationLocation };
  }
}

async function getAdjustmentPreview(
  filter: string,
  limit: number,
  { locationIds, managerLocationIds, operatorLocationIds }: LocationSets,
): Promise<PreviewItem[]> {
  let whereClause: object;

  switch (filter) {
    case 'REQUIRING_ACTION':
      if (managerLocationIds.length === 0) return [];
      whereClause = {
        status: 'SUBMITTED',
        items: { some: { locationId: { in: managerLocationIds } } },
      };
      break;
    case 'IN_PROGRESS':
      whereClause = {
        status: { in: ['SUBMITTED', 'APPROVED'] },
        items: { some: { locationId: { in: locationIds } } },
      };
      break;
    case 'READY_TO_FINALIZE':
      if (operatorLocationIds.length === 0) return [];
      whereClause = {
        status: 'APPROVED',
        items: { some: { locationId: { in: operatorLocationIds } } },
      };
      break;
    default:
      return [];
  }

  const records = await prisma.stockAdjustmentRequest.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      createdBy: { select: { id: true, username: true } },
      items: {
        select: {
          locationId: true,
          location: { select: { id: true, code: true, name: true } },
        },
        take: 1,
      },
    },
  });

  return (records as AdjustmentPreviewRecord[]).map((r) => mapToPreviewItem(r, 'ADJUSTMENT'));
}

async function getTransferPreview(
  filter: string,
  limit: number,
  { locationIds, managerLocationIds, operatorLocationIds }: LocationSets,
): Promise<PreviewItem[]> {
  let whereClause: object;

  switch (filter) {
    case 'REQUIRING_ACTION': {
      const conditions: object[] = [];
      if (managerLocationIds.length > 0) {
        conditions.push({ status: 'SUBMITTED', sourceLocationId: { in: managerLocationIds } });
      }
      if (operatorLocationIds.length > 0) {
        conditions.push({
          status: 'ORIGIN_MANAGER_APPROVED',
          destinationLocationId: { in: operatorLocationIds },
        });
      }
      if (conditions.length === 0) return [];
      whereClause = { OR: conditions };
      break;
    }
    case 'IN_PROGRESS':
      whereClause = {
        status: { in: ['SUBMITTED', 'ORIGIN_MANAGER_APPROVED', 'DESTINATION_OPERATOR_APPROVED'] },
        OR: [
          { sourceLocationId: { in: locationIds } },
          { destinationLocationId: { in: locationIds } },
        ],
      };
      break;
    case 'READY_TO_FINALIZE':
      if (operatorLocationIds.length === 0) return [];
      whereClause = {
        status: 'READY_TO_FINALIZE',
        destinationLocationId: { in: operatorLocationIds },
      };
      break;
    case 'ARRIVING':
      whereClause = {
        status: 'ORIGIN_MANAGER_APPROVED',
        destinationLocationId: { in: locationIds },
      };
      break;
    default:
      return [];
  }

  const records = await prisma.stockTransferRequest.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      createdBy: { select: { id: true, username: true } },
      sourceLocation: { select: { id: true, code: true, name: true } },
      destinationLocation: { select: { id: true, code: true, name: true } },
    },
  });

  return (records as TransferPreviewRecord[]).map((r) => mapToPreviewItem(r, 'TRANSFER'));
}

export async function getPreview({
  userId,
  isAdmin,
  type,
  filter,
  limit,
}: {
  userId: string;
  isAdmin: boolean;
  type: 'ADJUSTMENT' | 'TRANSFER';
  filter: 'REQUIRING_ACTION' | 'IN_PROGRESS' | 'READY_TO_FINALIZE' | 'ARRIVING';
  limit: number;
}): Promise<PreviewItem[]> {
  logger.info({ userId, type, filter, limit }, 'Dashboard preview query');

  const locationSets = await resolveUserLocations(userId, isAdmin);

  if (locationSets.locationIds.length === 0) {
    return [];
  }

  if (type === 'ADJUSTMENT') {
    return getAdjustmentPreview(filter, limit, locationSets);
  }
  return getTransferPreview(filter, limit, locationSets);
}

import prisma from '../../../config/database';
import { Location, AdjustmentRequestStatus, TransferRequestStatus } from '@prisma/client';

const ADJ_TERMINAL: AdjustmentRequestStatus[] = [
  AdjustmentRequestStatus.FINALIZED,
  AdjustmentRequestStatus.CANCELLED,
  AdjustmentRequestStatus.REJECTED,
];
const TRF_TERMINAL: TransferRequestStatus[] = [
  TransferRequestStatus.FINALIZED,
  TransferRequestStatus.CANCELLED,
  TransferRequestStatus.REJECTED,
];

export type OperationalStatus = 'FULL' | 'PARTIAL' | 'NONE';

export type LocationRow = Location & {
  blockingRequestCount: number;
  operationalStatus: OperationalStatus;
};

export class LocationRepository {
  async findById(id: string): Promise<Location | null> {
    return prisma.location.findUnique({ where: { id } });
  }

  async findByCode(code: string): Promise<Location | null> {
    return prisma.location.findUnique({ where: { code } });
  }

  async findAll(): Promise<Location[]> {
    return prisma.location.findMany({ where: { isActive: true } });
  }

  async adminFindAll(status?: 'ACTIVE' | 'INACTIVE' | 'ALL'): Promise<LocationRow[]> {
    const where =
      status === 'ACTIVE'   ? { isActive: true }  :
      status === 'INACTIVE' ? { isActive: false } :
      {};

    const locations = await prisma.location.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    const [counts, roleGroups] = await Promise.all([
      Promise.all(locations.map((loc) => this.countPendingRequests(loc.id))),
      Promise.all(
        locations.map((loc) =>
          // Only count active users — deactivating a user must immediately reflect in operationalStatus
          prisma.userLocationRole.findMany({
            where: { locationId: loc.id, user: { isActive: true } },
            select: { role: true },
          }),
        ),
      ),
    ]);

    return locations.map((loc, i) => {
      const roles = roleGroups[i];
      const hasOperator = roles.some((r) => r.role === 'OPERATOR');
      const hasManager  = roles.some((r) => r.role === 'MANAGER');
      const operationalStatus: OperationalStatus =
        hasOperator && hasManager ? 'FULL' :
        hasOperator || hasManager ? 'PARTIAL' :
        'NONE';
      return {
        ...loc,
        blockingRequestCount: counts[i],
        operationalStatus,
      };
    });
  }

  async create(data: { code: string; name: string; address?: string }): Promise<Location> {
    return prisma.location.create({ data });
  }

  async update(id: string, data: { name?: string; address?: string | null }): Promise<Location> {
    return prisma.location.update({ where: { id }, data });
  }

  async toggleActive(id: string, isActive: boolean): Promise<Location> {
    return prisma.location.update({ where: { id }, data: { isActive } });
  }

  async countPendingRequests(locationId: string): Promise<number> {
    const [adjustments, transfers] = await Promise.all([
      prisma.stockAdjustmentRequest.count({
        where: {
          status: { notIn: ADJ_TERMINAL },
          items:  { some: { locationId } },
        },
      }),
      prisma.stockTransferRequest.count({
        where: {
          status: { notIn: TRF_TERMINAL },
          OR: [
            { sourceLocationId:      locationId },
            { destinationLocationId: locationId },
          ],
        },
      }),
    ]);
    return adjustments + transfers;
  }
}

export const locationRepository = new LocationRepository();

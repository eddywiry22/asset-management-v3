import { PrismaClient } from '@prisma/client';

type PrismaLike = Pick<PrismaClient, 'userLocationRole'>;

/**
 * Returns users who are eligible to act on the NEXT step of an adjustment.
 *
 * SUBMITTED  → MANAGERs at the item location(s) can approve
 * APPROVED   → OPERATOR or MANAGER at item location(s) can finalize
 */
export async function getAdjustmentEligibleUsers(
  prisma: PrismaLike,
  adjustment: { status: string; items?: Array<{ locationId: string }> },
) {
  const locationIds = [...new Set((adjustment.items ?? []).map((i) => i.locationId))];
  if (locationIds.length === 0) return [];

  switch (adjustment.status) {
    case 'SUBMITTED':
      return prisma.userLocationRole.findMany({
        where: { locationId: { in: locationIds }, role: 'MANAGER' },
        include: { user: true },
      });
    case 'APPROVED': // called MANAGER_APPROVED in the spec
      return prisma.userLocationRole.findMany({
        where: { locationId: { in: locationIds }, role: { in: ['OPERATOR', 'MANAGER'] } },
        include: { user: true },
      });
    default:
      return [];
  }
}

/**
 * Returns users who are eligible to act on the NEXT step of a transfer.
 *
 * SUBMITTED               → MANAGERs at the source (origin) location can approve
 * ORIGIN_MANAGER_APPROVED → OPERATOR or MANAGER at destination can approve
 * READY_TO_FINALIZE       → OPERATOR or MANAGER at destination can finalize
 */
export async function getTransferEligibleUsers(
  prisma: PrismaLike,
  transfer: {
    status: string;
    sourceLocationId: string;
    destinationLocationId: string;
  },
) {
  switch (transfer.status) {
    case 'SUBMITTED':
      return prisma.userLocationRole.findMany({
        where: { locationId: transfer.sourceLocationId, role: 'MANAGER' },
        include: { user: true },
      });
    case 'ORIGIN_MANAGER_APPROVED':
    case 'READY_TO_FINALIZE':
      return prisma.userLocationRole.findMany({
        where: {
          locationId: transfer.destinationLocationId,
          role: { in: ['OPERATOR', 'MANAGER'] },
        },
        include: { user: true },
      });
    default:
      return [];
  }
}

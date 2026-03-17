import prisma from '../config/database';
import { ForbiddenError } from './errors';

/**
 * Asserts that a user has access to a specific location.
 *
 * Rules:
 *  - ADMIN users (isAdmin = true) can access all locations.
 *  - MANAGER and OPERATOR users can only access locations they are assigned to
 *    via UserLocationRole.
 *
 * @throws ForbiddenError if the user is not an admin and has no role at locationId.
 */
export async function assertUserCanAccessLocation(
  userId: string,
  isAdmin: boolean,
  locationId: string,
): Promise<void> {
  if (isAdmin) return;

  const role = await prisma.userLocationRole.findFirst({
    where: { userId, locationId },
  });

  if (!role) {
    throw new ForbiddenError('You do not have access to this location');
  }
}

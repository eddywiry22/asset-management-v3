import prisma from '../../../config/database';
import { User, UserLocationRole, Location, Role } from '@prisma/client';

export type UserWithLocations = User & {
  locationRoles: (UserLocationRole & { location: Location })[];
};

export type UserRow = {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
  assignedLocations: {
    locationId: string;
    locationCode: string;
    locationName: string;
    isActive: boolean;
    role: Role;
  }[];
};

export type UsersFilter = {
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  role?: Role;
  locationId?: string;
};

function toUserRow(user: UserWithLocations): UserRow {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    assignedLocations: user.locationRoles.map((lr) => ({
      locationId: lr.locationId,
      locationCode: lr.location.code,
      locationName: lr.location.name,
      isActive: lr.location.isActive,
      role: lr.role,
    })),
  };
}

export class AdminUsersRepository {
  private includeLocations = {
    locationRoles: {
      include: { location: true },
    },
  };

  async findAll(filter: UsersFilter): Promise<UserRow[]> {
    const where: Record<string, unknown> = { isAdmin: false };

    if (filter.status === 'ACTIVE') where.isActive = true;
    else if (filter.status === 'INACTIVE') where.isActive = false;

    if (filter.role) {
      where.locationRoles = { some: { role: filter.role } };
    }

    if (filter.locationId) {
      where.locationRoles = {
        ...(typeof where.locationRoles === 'object' ? (where.locationRoles as object) : {}),
        some: {
          ...(filter.role ? { role: filter.role } : {}),
          locationId: filter.locationId,
        },
      };
    }

    const users = await prisma.user.findMany({
      where,
      include: this.includeLocations,
      orderBy: { createdAt: 'desc' },
    });

    return users.map(toUserRow);
  }

  async findById(id: string): Promise<UserRow | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: this.includeLocations,
    });
    if (!user) return null;
    return toUserRow(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { phone } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { username } });
  }

  async create(data: {
    username: string;
    email?: string | null;
    phone?: string | null;
    passwordHash: string;
  }): Promise<User> {
    return prisma.user.create({ data: { ...data, isActive: true, isAdmin: false } });
  }

  async update(
    id: string,
    data: { username?: string; email?: string | null; phone?: string | null },
  ): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async toggleActive(id: string, isActive: boolean): Promise<User> {
    return prisma.user.update({ where: { id }, data: { isActive } });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /** Replace all location-role assignments for a user */
  async replaceLocationRoles(
    userId: string,
    assignments: { locationId: string; role: Role }[],
  ): Promise<void> {
    await prisma.$transaction([
      prisma.userLocationRole.deleteMany({ where: { userId } }),
      ...(assignments.length > 0
        ? [
            prisma.userLocationRole.createMany({
              data: assignments.map((a) => ({ userId, locationId: a.locationId, role: a.role })),
            }),
          ]
        : []),
    ]);
  }
}

export const adminUsersRepository = new AdminUsersRepository();

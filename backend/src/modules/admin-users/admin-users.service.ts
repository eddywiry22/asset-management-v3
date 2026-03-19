import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { adminUsersRepository, UserRow, UsersFilter } from './repositories/admin-users.repository';
import { AppError, NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { auditService } from '../../services/audit.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './admin-users.validator';
import logger from '../../utils/logger';
import prisma from '../../config/database';
import {
  getAdjustmentEligibleUsers,
  getTransferEligibleUsers,
} from '../stock/utils/workflowResponsibility';

export class AdminUsersService {
  async findAll(filter: UsersFilter): Promise<UserRow[]> {
    return adminUsersRepository.findAll(filter);
  }

  async findById(id: string): Promise<UserRow> {
    const user = await adminUsersRepository.findById(id);
    if (!user) throw new NotFoundError(`User not found: ${id}`);
    return user;
  }

  async create(dto: CreateUserDto, performedBy: string): Promise<UserRow> {
    // Enforce: cannot create admin via API
    // (role field is already restricted by Zod schema, but defense-in-depth)

    // Unique checks
    if (dto.email) {
      const existing = await adminUsersRepository.findByEmail(dto.email);
      if (existing) throw new ValidationError(`Email "${dto.email}" is already in use`);
    }
    if (dto.phone) {
      const existing = await adminUsersRepository.findByPhone(dto.phone);
      if (existing) throw new ValidationError(`Phone "${dto.phone}" is already in use`);
    }
    const existingUsername = await adminUsersRepository.findByUsername(dto.username);
    if (existingUsername) {
      throw new ValidationError(`Username "${dto.username}" is already in use`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await adminUsersRepository.create({
      username: dto.username,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      passwordHash,
    });

    // Assign locations (all with same role)
    if (dto.locationIds.length > 0) {
      await this.validateLocationsExist(dto.locationIds);
      await adminUsersRepository.replaceLocationRoles(
        user.id,
        dto.locationIds.map((locationId) => ({ locationId, role: dto.role as Role })),
      );
    }

    logger.info('[AdminUser] Created', { id: user.id, username: user.username });

    void auditService.log({
      userId: performedBy,
      action: 'CREATE',
      entityType: 'USER',
      entityId: user.id,
      afterSnapshot: { username: user.username, email: user.email, role: dto.role, locationIds: dto.locationIds },
    });

    const result = await this.findById(user.id);
    return result;
  }

  async update(id: string, dto: UpdateUserDto, performedBy: string): Promise<UserRow> {
    const before = await this.findById(id);

    if (before.isAdmin) {
      throw new ForbiddenError('Cannot update admin users via API');
    }

    // Unique checks (skip if unchanged)
    if (dto.email && dto.email !== before.email) {
      const existing = await adminUsersRepository.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ValidationError(`Email "${dto.email}" is already in use`);
      }
    }
    if (dto.phone && dto.phone !== before.phone) {
      const existing = await adminUsersRepository.findByPhone(dto.phone);
      if (existing && existing.id !== id) {
        throw new ValidationError(`Phone "${dto.phone}" is already in use`);
      }
    }
    if (dto.username && dto.username !== before.username) {
      const existing = await adminUsersRepository.findByUsername(dto.username);
      if (existing && existing.id !== id) {
        throw new ValidationError(`Username "${dto.username}" is already in use`);
      }
    }

    // Update user fields
    const updateData: { username?: string; email?: string | null; phone?: string | null } = {};
    if (dto.username !== undefined) updateData.username = dto.username;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phone !== undefined) updateData.phone = dto.phone;

    if (Object.keys(updateData).length > 0) {
      await adminUsersRepository.update(id, updateData);
    }

    // Update location assignments if provided
    if (dto.locationIds !== undefined) {
      const role = (dto.role ?? before.assignedLocations[0]?.role ?? 'OPERATOR') as Role;
      if (dto.locationIds.length > 0) {
        await this.validateLocationsExist(dto.locationIds);
      }
      await adminUsersRepository.replaceLocationRoles(
        id,
        dto.locationIds.map((locationId) => ({ locationId, role })),
      );
    }

    logger.info('[AdminUser] Updated', { id });

    void auditService.log({
      userId: performedBy,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: id,
      beforeSnapshot: {
        username: before.username,
        email: before.email,
        role: before.assignedLocations[0]?.role,
        locationIds: before.assignedLocations.map((l) => l.locationId),
      },
      afterSnapshot: {
        username: dto.username ?? before.username,
        email: dto.email ?? before.email,
        role: dto.role ?? before.assignedLocations[0]?.role,
        locationIds: dto.locationIds ?? before.assignedLocations.map((l) => l.locationId),
      },
    });

    return this.findById(id);
  }

  async toggleActive(id: string, performedBy: string): Promise<UserRow> {
    const user = await this.findById(id);

    if (user.isAdmin) {
      throw new ForbiddenError('Cannot toggle admin user status via API');
    }

    const newActive = !user.isActive;

    if (!newActive) {
      // Stage 8.6: check if user is role-eligible to complete any active workflow step.
      // This prevents deadlocks: if the user is the only one who can progress a workflow,
      // they cannot be deactivated until the workflow is resolved.

      const [activeAdjustments, activeTransfers] = await Promise.all([
        prisma.stockAdjustmentRequest.findMany({
          where: { status: { in: ['SUBMITTED', 'APPROVED'] } },
          include: { items: { select: { locationId: true } } },
        }),
        prisma.stockTransferRequest.findMany({
          where: { status: { in: ['SUBMITTED', 'ORIGIN_MANAGER_APPROVED', 'READY_TO_FINALIZE'] } },
          select: { id: true, status: true, sourceLocationId: true, destinationLocationId: true },
        }),
      ]);

      for (const adj of activeAdjustments) {
        const eligible = await getAdjustmentEligibleUsers(prisma, adj);
        if (eligible.some((e: { userId: string }) => e.userId === id)) {
          throw new AppError(400, 'User is required to complete ongoing adjustment workflows', {
            blocking: { adjustmentId: adj.id, status: adj.status },
          });
        }
      }

      for (const trf of activeTransfers) {
        const eligible = await getTransferEligibleUsers(prisma, trf);
        if (eligible.some((e: { userId: string }) => e.userId === id)) {
          throw new AppError(400, 'User is required to complete ongoing transfer workflows', {
            blocking: { transferId: trf.id, status: trf.status },
          });
        }
      }
    }

    await adminUsersRepository.toggleActive(id, newActive);

    logger.info('[AdminUser] Toggled active', { id, isActive: newActive });

    void auditService.log({
      userId: performedBy,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: id,
      beforeSnapshot: { isActive: user.isActive },
      afterSnapshot: { isActive: newActive },
    });

    return this.findById(id);
  }

  async resetPassword(id: string, newPassword: string, performedBy: string): Promise<void> {
    const user = await this.findById(id);

    if (user.isAdmin) {
      throw new ForbiddenError('Cannot reset admin user password via API');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await adminUsersRepository.updatePasswordHash(id, passwordHash);

    logger.info('[AdminUser] Password reset', { id });

    void auditService.log({
      userId: performedBy,
      action: 'USER_PASSWORD_RESET',
      entityType: 'USER',
      entityId: id,
      afterSnapshot: { passwordReset: true },
    });
  }

  private async validateLocationsExist(locationIds: string[]): Promise<void> {
    const locations = await prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true },
    });
    if (locations.length !== locationIds.length) {
      const found = new Set(locations.map((l) => l.id));
      const missing = locationIds.filter((id) => !found.has(id));
      throw new ValidationError(`Location(s) not found: ${missing.join(', ')}`);
    }
  }
}

export const adminUsersService = new AdminUsersService();

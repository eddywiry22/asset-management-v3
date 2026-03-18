import { Location } from '@prisma/client';
import { locationRepository, LocationRow } from './repositories/location.repository';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { auditService } from '../../services/audit.service';
import { CreateLocationDto, UpdateLocationDto } from './location.validator';
import logger from '../../utils/logger';

export class LocationsService {
  async findById(id: string): Promise<Location> {
    const location = await locationRepository.findById(id);
    if (!location) {
      throw new NotFoundError(`Location not found: ${id}`);
    }
    return location;
  }

  async findAll(): Promise<Location[]> {
    return locationRepository.findAll();
  }

  // ── Admin methods ──────────────────────────────────────────────────────────

  async adminFindAll(status?: string): Promise<LocationRow[]> {
    const normalized =
      status === 'ACTIVE' || status === 'INACTIVE' ? status : 'ALL';
    return locationRepository.adminFindAll(normalized as 'ACTIVE' | 'INACTIVE' | 'ALL');
  }

  async adminCreate(dto: CreateLocationDto, performedBy: string): Promise<Location> {
    const existing = await locationRepository.findByCode(dto.code);
    if (existing) {
      throw new ValidationError(`Location code "${dto.code}" already exists`);
    }

    const location = await locationRepository.create({
      code:    dto.code,
      name:    dto.name,
      address: dto.address,
    });

    logger.info('[Location] Created', { id: location.id, code: location.code });

    void auditService.log({
      entityType:    'LOCATION',
      entityId:      location.id,
      action:        'CREATE',
      afterSnapshot: location,
      performedBy,
    });

    return location;
  }

  async adminUpdate(id: string, dto: UpdateLocationDto, performedBy: string): Promise<Location> {
    const before = await this.findById(id);

    const updated = await locationRepository.update(id, {
      name:    dto.name,
      address: dto.address,
    });

    logger.info('[Location] Updated', { id });

    void auditService.log({
      entityType:     'LOCATION',
      entityId:       id,
      action:         'UPDATE',
      beforeSnapshot: { name: before.name, address: before.address },
      afterSnapshot:  { name: updated.name, address: updated.address },
      performedBy,
    });

    return updated;
  }

  async adminToggleActive(id: string, performedBy: string): Promise<Location & { blockingRequestCount: number }> {
    const location = await this.findById(id);
    const newActive = !location.isActive;

    // Block deactivation if pending requests exist
    if (!newActive) {
      const blockingRequestCount = await locationRepository.countPendingRequests(id);
      if (blockingRequestCount > 0) {
        logger.warn('[Location] Deactivation blocked — pending requests', { id, blockingRequestCount });
        throw new ValidationError(
          `Cannot deactivate this location while there are pending requests. Resolve them first.`,
          blockingRequestCount,
        );
      }
    }

    const updated = await locationRepository.toggleActive(id, newActive);

    logger.info('[Location] Toggled active', { id, isActive: newActive });

    void auditService.log({
      entityType:     'LOCATION',
      entityId:       id,
      action:         'UPDATE',
      beforeSnapshot: { isActive: location.isActive },
      afterSnapshot:  { isActive: newActive },
      performedBy,
    });

    return { ...updated, blockingRequestCount: 0 };
  }
}

export const locationsService = new LocationsService();

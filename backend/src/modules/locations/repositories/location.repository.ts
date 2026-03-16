import prisma from '../../../config/database';
import { Location } from '@prisma/client';

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
}

export const locationRepository = new LocationRepository();

import prisma from '../../../config/database';
import { Uom } from '@prisma/client';

export class UomRepository {
  async findAll(page = 1, limit = 20): Promise<{ data: Uom[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.uom.findMany({ skip, take: limit, orderBy: { code: 'asc' } }),
      prisma.uom.count(),
    ]);
    return { data, total };
  }

  async findById(id: string): Promise<Uom | null> {
    return prisma.uom.findUnique({ where: { id } });
  }

  async findByCode(code: string): Promise<Uom | null> {
    return prisma.uom.findUnique({ where: { code } });
  }

  async create(data: { code: string; name: string }): Promise<Uom> {
    return prisma.uom.create({ data });
  }
}

export const uomRepository = new UomRepository();

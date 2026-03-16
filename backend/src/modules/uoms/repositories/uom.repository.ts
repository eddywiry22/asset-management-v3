import prisma from '../../../config/database';
import { Uom } from '@prisma/client';

export class UomRepository {
  async findAll(): Promise<Uom[]> {
    return prisma.uom.findMany({ orderBy: { code: 'asc' } });
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

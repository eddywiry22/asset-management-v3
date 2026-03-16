import prisma from '../../../config/database';
import { Vendor } from '@prisma/client';

export class VendorRepository {
  async findAll(): Promise<Vendor[]> {
    return prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string): Promise<Vendor | null> {
    return prisma.vendor.findUnique({ where: { id } });
  }

  async create(data: { name: string; contactInfo: string; isActive?: boolean }): Promise<Vendor> {
    return prisma.vendor.create({ data });
  }

  async update(id: string, data: { name?: string; contactInfo?: string; isActive?: boolean }): Promise<Vendor> {
    return prisma.vendor.update({ where: { id }, data });
  }

  async hasGoods(id: string): Promise<boolean> {
    const count = await prisma.goods.count({ where: { vendorId: id } });
    return count > 0;
  }
}

export const vendorRepository = new VendorRepository();

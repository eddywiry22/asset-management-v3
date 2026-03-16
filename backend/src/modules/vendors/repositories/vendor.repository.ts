import prisma from '../../../config/database';
import { Vendor } from '@prisma/client';

export class VendorRepository {
  async findAll(page = 1, limit = 20): Promise<{ data: Vendor[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.vendor.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.vendor.count(),
    ]);
    return { data, total };
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

  async hasProducts(id: string): Promise<boolean> {
    const count = await prisma.product.count({ where: { vendorId: id } });
    return count > 0;
  }
}

export const vendorRepository = new VendorRepository();

import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

export type ProductWithRelations = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string };
  vendor:   { id: string; name: string };
  uom:      { id: string; code: string; name: string };
};

const RELATIONS = {
  category: { select: { id: true, name: true } },
  vendor:   { select: { id: true, name: true } },
  uom:      { select: { id: true, code: true, name: true } },
};

export class ProductRepository {
  async findAll(params: {
    page?: number;
    limit?: number;
    where?: Prisma.ProductWhereInput;
  } = {}): Promise<{ data: ProductWithRelations[]; total: number }> {
    const { page = 1, limit = 20, where = {} } = params;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: RELATIONS,
        orderBy: { sku: 'asc' },
      }) as Promise<ProductWithRelations[]>,
      prisma.product.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string): Promise<ProductWithRelations | null> {
    return prisma.product.findUnique({
      where: { id },
      include: RELATIONS,
    }) as Promise<ProductWithRelations | null>;
  }

  async findBySku(sku: string): Promise<{ id: string } | null> {
    return prisma.product.findUnique({ where: { sku }, select: { id: true } });
  }

  async update(id: string, data: {
    name?: string;
    categoryId?: string;
    vendorId?: string;
    uomId?: string;
  }): Promise<ProductWithRelations> {
    return prisma.product.update({
      where: { id },
      data,
      include: RELATIONS,
    }) as Promise<ProductWithRelations>;
  }

  async getAllCategories(): Promise<{ id: string; name: string }[]> {
    return prisma.category.findMany({ select: { id: true, name: true } });
  }

  async getAllVendors(): Promise<{ id: string; name: string }[]> {
    return prisma.vendor.findMany({ select: { id: true, name: true } });
  }

  async getAllUoms(): Promise<{ id: string; name: string }[]> {
    return prisma.uom.findMany({ select: { id: true, name: true } });
  }
}

export const productRepository = new ProductRepository();

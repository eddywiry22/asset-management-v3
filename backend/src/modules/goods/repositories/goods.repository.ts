import prisma from '../../../config/database';
import { Product } from '@prisma/client';

export type GoodsWithRelations = Product & {
  category: { id: string; name: string };
  vendor:   { id: string; name: string };
  uom:      { id: string; code: string; name: string };
};

export class GoodsRepository {
  async findAll(): Promise<GoodsWithRelations[]> {
    return prisma.product.findMany({
      include: {
        category: { select: { id: true, name: true } },
        vendor:   { select: { id: true, name: true } },
        uom:      { select: { id: true, code: true, name: true } },
      },
      orderBy: { sku: 'asc' },
    }) as Promise<GoodsWithRelations[]>;
  }

  async findById(id: string): Promise<GoodsWithRelations | null> {
    return prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        vendor:   { select: { id: true, name: true } },
        uom:      { select: { id: true, code: true, name: true } },
      },
    }) as Promise<GoodsWithRelations | null>;
  }

  async findBySku(sku: string): Promise<Product | null> {
    return prisma.product.findUnique({ where: { sku } });
  }

  async update(id: string, data: {
    name?: string;
    categoryId?: string;
    vendorId?: string;
    uomId?: string;
  }): Promise<GoodsWithRelations> {
    return prisma.product.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true } },
        vendor:   { select: { id: true, name: true } },
        uom:      { select: { id: true, code: true, name: true } },
      },
    }) as Promise<GoodsWithRelations>;
  }
}

export const goodsRepository = new GoodsRepository();

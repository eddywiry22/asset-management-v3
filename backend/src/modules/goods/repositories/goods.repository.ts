import prisma from '../../../config/database';
import { Goods } from '@prisma/client';

export type GoodsWithRelations = Goods & {
  category: { id: string; name: string };
  vendor:   { id: string; name: string };
  uom:      { id: string; code: string; name: string };
};

export class GoodsRepository {
  async findAll(): Promise<GoodsWithRelations[]> {
    return prisma.goods.findMany({
      include: {
        category: { select: { id: true, name: true } },
        vendor:   { select: { id: true, name: true } },
        uom:      { select: { id: true, code: true, name: true } },
      },
      orderBy: { sku: 'asc' },
    }) as Promise<GoodsWithRelations[]>;
  }

  async findById(id: string): Promise<GoodsWithRelations | null> {
    return prisma.goods.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        vendor:   { select: { id: true, name: true } },
        uom:      { select: { id: true, code: true, name: true } },
      },
    }) as Promise<GoodsWithRelations | null>;
  }

  async findBySku(sku: string): Promise<Goods | null> {
    return prisma.goods.findUnique({ where: { sku } });
  }

  async create(data: {
    sku: string;
    name: string;
    categoryId: string;
    vendorId: string;
    uomId: string;
    isActive?: boolean;
  }): Promise<GoodsWithRelations> {
    return prisma.goods.create({
      data,
      include: {
        category: { select: { id: true, name: true } },
        vendor:   { select: { id: true, name: true } },
        uom:      { select: { id: true, code: true, name: true } },
      },
    }) as Promise<GoodsWithRelations>;
  }

  async update(id: string, data: {
    name?: string;
    categoryId?: string;
    vendorId?: string;
    uomId?: string;
    isActive?: boolean;
  }): Promise<GoodsWithRelations> {
    return prisma.goods.update({
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

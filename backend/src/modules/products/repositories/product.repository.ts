import prisma from '../../../config/database';

export type ProductWithRelations = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  isActive: boolean;
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
  async findAll(page = 1, limit = 20): Promise<{ data: ProductWithRelations[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        skip,
        take: limit,
        include: RELATIONS,
        orderBy: { sku: 'asc' },
      }) as Promise<ProductWithRelations[]>,
      prisma.product.count(),
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

  async create(data: {
    sku: string;
    name: string;
    categoryId: string;
    vendorId: string;
    uomId: string;
    isActive?: boolean;
  }): Promise<ProductWithRelations> {
    return prisma.product.create({
      data,
      include: RELATIONS,
    }) as Promise<ProductWithRelations>;
  }

  async update(id: string, data: {
    name?: string;
    categoryId?: string;
    vendorId?: string;
    uomId?: string;
    isActive?: boolean;
  }): Promise<ProductWithRelations> {
    return prisma.product.update({
      where: { id },
      data,
      include: RELATIONS,
    }) as Promise<ProductWithRelations>;
  }
}

export const productRepository = new ProductRepository();

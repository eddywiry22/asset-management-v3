import prisma from '../../config/database';

export type ProductLocationRow = {
  id:         string;
  productId:  string;
  locationId: string;
  isActive:   boolean;
  createdAt:  Date;
  updatedAt:  Date;
  product:    { id: string; sku: string; name: string };
  location:   { id: string; code: string; name: string };
};

// Prisma client may not yet have typed `productLocation` if client has not been
// regenerated — use `(prisma as any).productLocation` for direct access.
const pl = () => (prisma as any).productLocation;

const INCLUDE = {
  product:  { select: { id: true, sku: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
};

export class ProductLocationRepository {
  async findAll(page = 1, limit = 20): Promise<{ data: ProductLocationRow[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      pl().findMany({ skip, take: limit, include: INCLUDE, orderBy: { createdAt: 'asc' } }),
      pl().count(),
    ]);
    return { data, total };
  }

  async findById(id: string): Promise<ProductLocationRow | null> {
    return pl().findUnique({ where: { id }, include: INCLUDE });
  }

  async findByProductAndLocation(productId: string, locationId: string): Promise<{ id: string } | null> {
    return pl().findFirst({ where: { productId, locationId }, select: { id: true } });
  }

  async create(data: {
    productId:  string;
    locationId: string;
    isActive:   boolean;
  }): Promise<ProductLocationRow> {
    return pl().create({ data, include: INCLUDE });
  }

  async update(id: string, data: { isActive: boolean }): Promise<ProductLocationRow> {
    return pl().update({ where: { id }, data, include: INCLUDE });
  }

  async delete(id: string): Promise<void> {
    await pl().delete({ where: { id } });
  }

  async hasLedgerEntries(productId: string, locationId: string): Promise<boolean> {
    const count = await prisma.stockLedger.count({ where: { productId, locationId } });
    return count > 0;
  }
}

export const productLocationRepository = new ProductLocationRepository();

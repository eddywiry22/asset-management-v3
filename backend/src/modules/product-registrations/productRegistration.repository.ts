import prisma from '../../config/database';
import { AdjustmentRequestStatus, TransferRequestStatus } from '@prisma/client';

export type ProductLocationRow = {
  id:         string;
  productId:  string;
  locationId: string;
  isActive:   boolean;
  createdAt:  Date;
  updatedAt:  Date;
  product:    { id: string; sku: string; name: string; lifecycleStatus: 'ACTIVE' | 'RETIRED'; category?: { id: string; name: string } | null };
  location:   { id: string; code: string; name: string };
};

// Prisma client may not yet have typed `productLocation` if client has not been
// regenerated — use `(prisma as any).productLocation` for direct access.
const pl = () => (prisma as any).productLocation;

const INCLUDE = {
  product:  { select: { id: true, sku: true, name: true, lifecycleStatus: true, category: { select: { id: true, name: true } } } },
  location: { select: { id: true, code: true, name: true } },
};

export class ProductLocationRepository {
  async findAll(params: {
    status?:       'ALL' | 'ACTIVE' | 'INACTIVE';
    page?:         number;
    pageSize?:     number;
    productIds?:   string[];
    locationIds?:  string[];
    categoryIds?:  string[];
  }): Promise<{ data: ProductLocationRow[]; total: number }> {
    const { status = 'ALL', page = 1, pageSize = 20, productIds, locationIds, categoryIds } = params;

    const where: any = {
      ...(status === 'ACTIVE'   && { isActive: true }),
      ...(status === 'INACTIVE' && { isActive: false }),
      ...(productIds?.length  && { productId:  { in: productIds } }),
      ...(locationIds?.length && { locationId: { in: locationIds } }),
      ...(categoryIds?.length && { product: { categoryId: { in: categoryIds } } }),
    };

    const [data, total] = await Promise.all([
      prisma.productLocation.findMany({
        where,
        include: {
          product:  { select: { id: true, name: true, sku: true, lifecycleStatus: true, category: { select: { id: true, name: true } } } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: [
          { product:  { name: 'asc' } },
          { location: { code: 'asc' } },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productLocation.count({ where }),
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

  async countPendingRequests(productId: string, locationId: string): Promise<{ adjustments: number; transfers: number }> {
    const ADJ_TERMINAL: AdjustmentRequestStatus[] = [
      AdjustmentRequestStatus.FINALIZED,
      AdjustmentRequestStatus.CANCELLED,
      AdjustmentRequestStatus.REJECTED,
    ];
    const TRF_TERMINAL: TransferRequestStatus[] = [
      TransferRequestStatus.FINALIZED,
      TransferRequestStatus.CANCELLED,
      TransferRequestStatus.REJECTED,
    ];

    const [adjustments, transfers] = await Promise.all([
      prisma.stockAdjustmentRequest.count({
        where: {
          status: { notIn: ADJ_TERMINAL },
          items:  { some: { productId, locationId } },
        },
      }),
      prisma.stockTransferRequest.count({
        where: {
          status: { notIn: TRF_TERMINAL },
          OR: [
            { sourceLocationId:      locationId, items: { some: { productId } } },
            { destinationLocationId: locationId, items: { some: { productId } } },
          ],
        },
      }),
    ]);

    return { adjustments, transfers };
  }
}

export const productLocationRepository = new ProductLocationRepository();

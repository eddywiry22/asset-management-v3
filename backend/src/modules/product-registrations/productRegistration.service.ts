import { productLocationRepository, ProductLocationRow } from './productRegistration.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CreateProductRegistrationDto, UpdateProductRegistrationDto } from './productRegistration.validator';
import prisma from '../../config/database';
import logger from '../../utils/logger';

export class ProductLocationService {
  async findAll(params: {
    page:        number;
    pageSize:    number;
    status:      'ALL' | 'ACTIVE' | 'INACTIVE';
    productId?:  string;
    locationId?: string;
  }): Promise<{ data: ProductLocationRow[]; total: number }> {
    logger.info('[Stage8] ProductRegistration findAll', params);
    return productLocationRepository.findAll(params);
  }

  async findById(id: string): Promise<ProductLocationRow> {
    const mapping = await productLocationRepository.findById(id);
    if (!mapping) throw new NotFoundError(`Product registration not found: ${id}`);
    return mapping;
  }

  async create(dto: CreateProductRegistrationDto, performedBy: string): Promise<ProductLocationRow> {
    // Validate product exists
    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new ValidationError(`Product not found: ${dto.productId}`);

    // Validate location exists
    const location = await prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) throw new ValidationError(`Location not found: ${dto.locationId}`);

    // Enforce uniqueness (productId + locationId)
    const existing = await productLocationRepository.findByProductAndLocation(dto.productId, dto.locationId);
    if (existing) {
      throw new ValidationError(
        `Product "${product.name}" is already registered at location "${location.name}"`,
      );
    }

    const mapping = await productLocationRepository.create({
      productId:  dto.productId,
      locationId: dto.locationId,
      isActive:   dto.isActive,
    });

    logger.info('[Stage8] ProductRegistration created', {
      id: mapping.id, productId: dto.productId, locationId: dto.locationId,
    });

    void auditService.log({
      entityType:  'PRODUCT_LOCATION',
      entityId:    mapping.id,
      action:      'CREATE',
      afterValue:  mapping,
      performedBy,
    });

    return mapping;
  }

  async checkDeactivation(id: string): Promise<{ canDeactivate: boolean; pendingCount: number; adjustments: number; transfers: number }> {
    const mapping = await this.findById(id);
    const { adjustments, transfers } = await productLocationRepository.countPendingRequests(mapping.productId, mapping.locationId);
    const pendingCount = adjustments + transfers;
    return { canDeactivate: pendingCount === 0, pendingCount, adjustments, transfers };
  }

  async update(id: string, dto: UpdateProductRegistrationDto, performedBy: string): Promise<ProductLocationRow> {
    const before = await this.findById(id);

    // Stage 8.2.2: block deactivation when pending requests exist
    if (dto.isActive === false && before.isActive === true) {
      const { adjustments, transfers } = await productLocationRepository.countPendingRequests(
        before.productId,
        before.locationId,
      );
      const pendingCount = adjustments + transfers;
      if (pendingCount > 0) {
        logger.warn('[Stage8] ProductRegistration deactivation blocked — pending requests', {
          id, productId: before.productId, locationId: before.locationId, adjustments, transfers,
        });
        throw new ValidationError(
          `Cannot deactivate this product at this location while there are pending requests ` +
          `(${adjustments} adjustment(s), ${transfers} transfer(s)). Resolve them first.`,
        );
      }
    }

    const updated = await productLocationRepository.update(id, { isActive: dto.isActive });

    logger.info('[Stage8] ProductRegistration updated', {
      id, isActive: dto.isActive,
      product:  before.product?.name,
      location: before.location?.name,
    });

    void auditService.log({
      entityType:  'PRODUCT_LOCATION',
      entityId:    id,
      action:      'UPDATE',
      beforeValue: before,
      afterValue:  updated,
      performedBy,
    });

    return updated;
  }

  async delete(id: string, performedBy: string): Promise<void> {
    const mapping = await this.findById(id);

    // Disallow deletion if ledger entries exist — preserve historical data
    const hasLedger = await productLocationRepository.hasLedgerEntries(
      mapping.productId,
      mapping.locationId,
    );
    if (hasLedger) {
      throw new ValidationError(
        `Cannot delete: ledger entries exist for product "${mapping.product?.name}" ` +
        `at location "${mapping.location?.name}". Deactivate instead.`,
      );
    }

    await productLocationRepository.delete(id);

    logger.info('[Stage8] ProductRegistration deleted', {
      id,
      productId:  mapping.productId,
      locationId: mapping.locationId,
    });

    void auditService.log({
      entityType:  'PRODUCT_LOCATION',
      entityId:    id,
      action:      'DELETE',
      beforeValue: mapping,
      performedBy,
    });
  }
}

export const productLocationService = new ProductLocationService();

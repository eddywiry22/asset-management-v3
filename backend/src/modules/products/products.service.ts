import { productRepository, ProductWithRelations } from './repositories/product.repository';
import { categoryRepository } from '../categories/repositories/category.repository';
import { vendorRepository } from '../vendors/repositories/vendor.repository';
import { uomRepository } from '../uoms/repositories/uom.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CreateProductDto, UpdateProductDto } from './products.validator';
import prisma from '../../config/database';
import logger from '../../utils/logger';

export class ProductsService {
  async findAll(page: number, limit: number): Promise<{ data: ProductWithRelations[]; total: number }> {
    return productRepository.findAll(page, limit);
  }

  async findById(id: string): Promise<ProductWithRelations> {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError(`Product not found: ${id}`);
    return product;
  }

  async create(dto: CreateProductDto, performedBy: string): Promise<ProductWithRelations> {
    const existingSku = await productRepository.findBySku(dto.sku);
    if (existingSku) throw new ValidationError(`SKU already exists: ${dto.sku}`);

    const category = await categoryRepository.findById(dto.categoryId);
    if (!category) throw new ValidationError(`Category not found: ${dto.categoryId}`);

    const vendor = await vendorRepository.findById(dto.vendorId);
    if (!vendor) throw new ValidationError(`Vendor not found: ${dto.vendorId}`);

    const uom = await uomRepository.findById(dto.uomId);
    if (!uom) throw new ValidationError(`UOM not found: ${dto.uomId}`);

    const product = await prisma.$transaction(async (tx) => {
      // 1. Create product
      const created = await tx.product.create({
        data: {
          sku:        dto.sku,
          name:       dto.name,
          categoryId: dto.categoryId,
          vendorId:   dto.vendorId,
          uomId:      dto.uomId,
        },
        include: {
          category: { select: { id: true, name: true } },
          vendor:   { select: { id: true, name: true } },
          uom:      { select: { id: true, code: true, name: true } },
        },
      });

      // 2. Fetch ALL locations
      const locations = await tx.location.findMany({
        select: { id: true },
      });

      // 3. Create product-location pairs (all inactive by default)
      if (locations.length > 0) {
        await tx.productLocation.createMany({
          data: locations.map((loc) => ({
            productId:  created.id,
            locationId: loc.id,
            isActive:   false,
          })),
          skipDuplicates: true,
        });
      }

      logger.info(
        { productId: created.id, locationCount: locations.length },
        'Product created with product-location backfill',
      );

      return created;
    });

    await auditService.log({
      entityType:  'PRODUCT',
      entityId:    product.id,
      action:      'CREATE',
      afterValue:  product,
      performedBy,
    });

    return product as ProductWithRelations;
  }

  async update(id: string, dto: UpdateProductDto, performedBy: string): Promise<ProductWithRelations> {
    const before = await this.findById(id);

    if (dto.categoryId) {
      const category = await categoryRepository.findById(dto.categoryId);
      if (!category) throw new ValidationError(`Category not found: ${dto.categoryId}`);
    }

    if (dto.vendorId) {
      const vendor = await vendorRepository.findById(dto.vendorId);
      if (!vendor) throw new ValidationError(`Vendor not found: ${dto.vendorId}`);
    }

    if (dto.uomId) {
      const uom = await uomRepository.findById(dto.uomId);
      if (!uom) throw new ValidationError(`UOM not found: ${dto.uomId}`);
    }

    const updated = await productRepository.update(id, dto);

    await auditService.log({
      entityType:  'PRODUCT',
      entityId:    id,
      action:      'UPDATE',
      beforeValue: before,
      afterValue:  updated,
      performedBy,
    });

    return updated;
  }
}

export const productsService = new ProductsService();

import { goodsRepository, GoodsWithRelations } from './repositories/goods.repository';
import { categoryRepository } from '../categories/repositories/category.repository';
import { vendorRepository } from '../vendors/repositories/vendor.repository';
import { uomRepository } from '../uoms/repositories/uom.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CreateGoodsDto, UpdateGoodsDto } from './goods.validator';

export class GoodsService {
  async findAll(): Promise<GoodsWithRelations[]> {
    return goodsRepository.findAll();
  }

  async findById(id: string): Promise<GoodsWithRelations> {
    const goods = await goodsRepository.findById(id);
    if (!goods) throw new NotFoundError(`Goods not found: ${id}`);
    return goods;
  }

  async create(dto: CreateGoodsDto, performedBy: string): Promise<GoodsWithRelations> {
    // SKU uniqueness
    const existingSku = await goodsRepository.findBySku(dto.sku);
    if (existingSku) throw new ValidationError(`SKU already exists: ${dto.sku}`);

    // Validate FK references
    const category = await categoryRepository.findById(dto.categoryId);
    if (!category) throw new ValidationError(`Category not found: ${dto.categoryId}`);

    const vendor = await vendorRepository.findById(dto.vendorId);
    if (!vendor) throw new ValidationError(`Vendor not found: ${dto.vendorId}`);

    const uom = await uomRepository.findById(dto.uomId);
    if (!uom) throw new ValidationError(`UOM not found: ${dto.uomId}`);

    const goods = await goodsRepository.create(dto);

    await auditService.log({
      entityType:  'GOODS',
      entityId:    goods.id,
      action:      'CREATE',
      afterValue:  goods,
      performedBy,
    });

    return goods;
  }

  async update(id: string, dto: UpdateGoodsDto, performedBy: string): Promise<GoodsWithRelations> {
    const before = await this.findById(id);

    // Validate FK references if being updated
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

    const updated = await goodsRepository.update(id, dto);

    await auditService.log({
      entityType:  'GOODS',
      entityId:    id,
      action:      'UPDATE',
      beforeValue: before,
      afterValue:  updated,
      performedBy,
    });

    return updated;
  }
}

export const goodsService = new GoodsService();

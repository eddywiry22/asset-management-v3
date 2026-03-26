import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
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
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    categoryIds?: string[];
    vendorIds?: string[];
  }): Promise<{ data: ProductWithRelations[]; total: number }> {
    const { page, limit, search, categoryIds, vendorIds } = params;
    const trimmedSearch = search?.trim();

    logger.info({ search, trimmedSearch }, 'Product search input');

    const where: Prisma.ProductWhereInput = {
      ...(trimmedSearch && {
        OR: [
          { name: { contains: trimmedSearch } },
          { sku:  { contains: trimmedSearch } },
        ],
      }),
      ...(categoryIds?.length && {
        categoryId: { in: categoryIds },
      }),
      ...(vendorIds?.length && {
        vendorId: { in: vendorIds },
      }),
    };

    logger.info({ where }, 'Product query where clause');

    return productRepository.findAll({ page, limit, where });
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

  async generateBulkTemplate(): Promise<ExcelJS.Buffer> {
    const [categories, vendors, uoms] = await Promise.all([
      productRepository.getAllCategories(),
      productRepository.getAllVendors(),
      productRepository.getAllUoms(),
    ]);

    const workbook = new ExcelJS.Workbook();

    // 1. Guidelines sheet
    const guidelines = workbook.addWorksheet('Guidelines');
    const guidelinesData = [
      ['Bulk Product Upload Template'],
      [''],
      ['Instructions:'],
      ['1. Fill in the "Add Products" sheet only.'],
      ['2. Required fields: sku, name, categoryName, vendorName, uomName'],
      ['3. SKU must be unique and not already exist.'],
      ['4. categoryName, vendorName, uomName must match existing values.'],
      ['5. Matching is case-insensitive.'],
      ['6. Maximum 100 rows allowed.'],
      ['7. Do not modify other sheets.'],
      [''],
      ['Example:'],
      ['sku: PROD-001'],
      ['name: Sample Product'],
      ['categoryName: Electronics'],
      ['vendorName: ABC Supplier'],
      ['uomName: PCS'],
    ];
    guidelinesData.forEach((row) => guidelines.addRow(row));
    guidelines.getColumn(1).width = 60;

    // 2. Categories sheet
    const categoriesSheet = workbook.addWorksheet('Categories');
    categoriesSheet.addRow(['id', 'name']);
    categoriesSheet.getRow(1).font = { bold: true };
    categoriesSheet.getColumn(1).width = 38;
    categoriesSheet.getColumn(2).width = 30;
    categories.forEach((c) => categoriesSheet.addRow([c.id, c.name]));

    // 3. Vendors sheet
    const vendorsSheet = workbook.addWorksheet('Vendors');
    vendorsSheet.addRow(['id', 'name']);
    vendorsSheet.getRow(1).font = { bold: true };
    vendorsSheet.getColumn(1).width = 38;
    vendorsSheet.getColumn(2).width = 30;
    vendors.forEach((v) => vendorsSheet.addRow([v.id, v.name]));

    // 4. UOMs sheet
    const uomsSheet = workbook.addWorksheet('UOMs');
    uomsSheet.addRow(['id', 'name']);
    uomsSheet.getRow(1).font = { bold: true };
    uomsSheet.getColumn(1).width = 38;
    uomsSheet.getColumn(2).width = 30;
    uoms.forEach((u) => uomsSheet.addRow([u.id, u.name]));

    // 5. Add Products sheet
    const addProducts = workbook.addWorksheet('Add Products');
    addProducts.addRow(['sku', 'name', 'categoryName', 'vendorName', 'uomName', 'error']);
    const headerRow = addProducts.getRow(1);
    headerRow.font = { bold: true };
    addProducts.getColumn(1).width = 20;  // sku
    addProducts.getColumn(2).width = 30;  // name
    addProducts.getColumn(3).width = 25;  // categoryName
    addProducts.getColumn(4).width = 25;  // vendorName
    addProducts.getColumn(5).width = 25;  // uomName
    addProducts.getColumn(6).width = 40;  // error
    addProducts.views = [{ state: 'frozen', ySplit: 1 }];
    addProducts.autoFilter = { from: 'A1', to: 'F1' };

    return workbook.xlsx.writeBuffer();
  }
}

export const productsService = new ProductsService();

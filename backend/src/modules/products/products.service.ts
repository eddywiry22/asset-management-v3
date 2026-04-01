import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';

export interface BulkUploadRow {
  rowNumber:    number;
  sku:          string | null;
  name:         string | null;
  categoryName: string | null;
  vendorName:   string | null;
  uomName:      string | null;
}
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

  async validateBulkRows(rows: BulkUploadRow[]): Promise<{
    summary: { total: number; valid: number; invalid: number };
    validRows: Array<{
      rowNumber: number;
      data: { sku: string; name: string; categoryId: string; vendorId: string; uomId: string };
    }>;
    invalidRows: Array<{
      rowNumber: number;
      raw: { sku: string | null; name: string | null; categoryName: string | null; vendorName: string | null; uomName: string | null };
      errors: string[];
    }>;
  }> {
    // Preload all reference data in one round-trip
    const [categories, vendors, uoms, existingSkus] = await Promise.all([
      productRepository.getAllCategories(),
      productRepository.getAllVendors(),
      productRepository.getAllUoms(),
      productRepository.getAllSkus(),
    ]);

    // Build lookup map with duplicate-name detection
    const buildLookupMap = (
      items: { id: string; name: string }[],
      entityLabel: string,
    ): Map<string, string> => {
      const nameToIds = new Map<string, string[]>();
      for (const item of items) {
        const key = item.name.trim().toLowerCase();
        const existing = nameToIds.get(key);
        if (existing) existing.push(item.id);
        else nameToIds.set(key, [item.id]);
      }
      const map = new Map<string, string>();
      for (const [key, ids] of nameToIds) {
        if (ids.length > 1) {
          throw new ValidationError(`Duplicate ${entityLabel} names detected in system`);
        }
        map.set(key, ids[0]);
      }
      return map;
    };

    const categoryMap = buildLookupMap(categories, 'category');
    const vendorMap   = buildLookupMap(vendors,    'vendor');
    const uomMap      = buildLookupMap(uoms,       'UOM');

    const existingSkuSet = new Set(existingSkus);

    // Detect duplicate SKUs within the file (case-insensitive)
    const fileSkuRows = new Map<string, number[]>();
    for (const row of rows) {
      if (row.sku) {
        const key = row.sku.trim().toLowerCase();
        const existing = fileSkuRows.get(key);
        if (existing) existing.push(row.rowNumber);
        else fileSkuRows.set(key, [row.rowNumber]);
      }
    }
    const duplicateFileSkus = new Set<string>();
    for (const [key, rowNums] of fileSkuRows) {
      if (rowNums.length > 1) duplicateFileSkus.add(key);
    }

    const validRows: Array<{
      rowNumber: number;
      data: { sku: string; name: string; categoryId: string; vendorId: string; uomId: string };
    }> = [];

    const invalidRows: Array<{
      rowNumber: number;
      raw: { sku: string | null; name: string | null; categoryName: string | null; vendorName: string | null; uomName: string | null };
      errors: string[];
    }> = [];

    for (const row of rows) {
      const errors: string[] = [];

      // Normalize: trim + empty → null
      const sku          = row.sku?.trim()          || null;
      const name         = row.name?.trim()         || null;
      const categoryName = row.categoryName?.trim() || null;
      const vendorName   = row.vendorName?.trim()   || null;
      const uomName      = row.uomName?.trim()      || null;

      // Required field checks
      if (!sku)          errors.push('SKU is required');
      if (!name)         errors.push('Name is required');
      if (!categoryName) errors.push('Category name is required');
      if (!vendorName)   errors.push('Vendor name is required');
      if (!uomName)      errors.push('UOM name is required');

      // Reference mapping
      let categoryId: string | undefined;
      let vendorId:   string | undefined;
      let uomId:      string | undefined;

      if (categoryName) {
        categoryId = categoryMap.get(categoryName.toLowerCase());
        if (!categoryId) errors.push(`Invalid categoryName: ${categoryName}`);
      }

      if (vendorName) {
        vendorId = vendorMap.get(vendorName.toLowerCase());
        if (!vendorId) errors.push(`Invalid vendorName: ${vendorName}`);
      }

      if (uomName) {
        uomId = uomMap.get(uomName.toLowerCase());
        if (!uomId) errors.push(`Invalid uomName: ${uomName}`);
      }

      // Duplicate SKU checks
      if (sku && duplicateFileSkus.has(sku.toLowerCase())) {
        errors.push('Duplicate SKU in file');
      }

      if (sku && existingSkuSet.has(sku.toLowerCase())) {
        errors.push('SKU already exists');
      }

      if (errors.length > 0) {
        invalidRows.push({
          rowNumber: row.rowNumber,
          raw: {
            sku:          row.sku,
            name:         row.name,
            categoryName: row.categoryName,
            vendorName:   row.vendorName,
            uomName:      row.uomName,
          },
          errors,
        });
      } else {
        validRows.push({
          rowNumber: row.rowNumber,
          data: {
            sku:        sku!,
            name:       name!,
            categoryId: categoryId!,
            vendorId:   vendorId!,
            uomId:      uomId!,
          },
        });
      }
    }

    // Sort invalidRows by rowNumber
    invalidRows.sort((a, b) => a.rowNumber - b.rowNumber);

    return {
      summary: {
        total:   rows.length,
        valid:   validRows.length,
        invalid: invalidRows.length,
      },
      validRows,
      invalidRows,
    };
  }

  async processBulkInsert(
    validRows: Array<{
      rowNumber: number;
      data: { sku: string; name: string; categoryId: string; vendorId: string; uomId: string };
    }>,
    performedBy: string,
  ): Promise<{
    summary: { total: number; success: number; failed: number };
    successRows: Array<{ rowNumber: number; sku: string }>;
    failedRows:  Array<{ rowNumber: number; sku: string; error: string }>;
  }> {
    const successRows: Array<{ rowNumber: number; sku: string }> = [];
    const failedRows:  Array<{ rowNumber: number; sku: string; error: string }> = [];

    for (const row of validRows) {
      try {
        await this.create(row.data, performedBy);
        successRows.push({ rowNumber: row.rowNumber, sku: row.data.sku });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create product';
        failedRows.push({ rowNumber: row.rowNumber, sku: row.data.sku, error: message });
      }
    }

    return {
      summary: {
        total:   validRows.length,
        success: successRows.length,
        failed:  failedRows.length,
      },
      successRows,
      failedRows,
    };
  }

  async annotateWorkbook(
    fileBuffer: Buffer,
    invalidRows: Array<{ rowNumber: number; errors: string[] }>,
    failedRows:  Array<{ rowNumber: number; sku: string; error: string }>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);

    const sheet = workbook.getWorksheet('Add Products');
    if (!sheet) {
      throw new ValidationError('Missing "Add Products" sheet in uploaded file');
    }

    // Build error map: rowNumber → error messages
    const errorMap = new Map<number, string[]>();

    for (const row of invalidRows) {
      errorMap.set(row.rowNumber, [...row.errors]);
    }

    for (const row of failedRows) {
      const existing = errorMap.get(row.rowNumber) ?? [];
      existing.push(row.error);
      errorMap.set(row.rowNumber, existing);
    }

    // Write errors into column F, preserving all other columns
    sheet.eachRow((_row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const errors = errorMap.get(rowNumber);
      if (errors && errors.length > 0) {
        sheet.getCell(`F${rowNumber}`).value = errors.join('; ');
      }
    });

    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }

  async processBulkUpload(fileBuffer: Buffer, performedBy: string): Promise<Buffer> {
    const rows       = await this.parseBulkUpload(fileBuffer);
    const validation = await this.validateBulkRows(rows);
    const insert     = await this.processBulkInsert(validation.validRows, performedBy);
    return this.annotateWorkbook(fileBuffer, validation.invalidRows, insert.failedRows);
  }

  async parseBulkUpload(fileBuffer: Buffer): Promise<BulkUploadRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);

    const sheet = workbook.getWorksheet('Add Products');
    if (!sheet) {
      throw new ValidationError('Missing "Add Products" sheet in uploaded file');
    }

    const rows: BulkUploadRow[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const getCellValue = (col: number): string | null => {
        const cell = row.getCell(col);
        const val = cell.value;
        if (val === null || val === undefined) return null;
        const str = String(val).trim();
        return str === '' ? null : str;
      };

      const parsed: BulkUploadRow = {
        rowNumber,
        sku:          getCellValue(1),
        name:         getCellValue(2),
        categoryName: getCellValue(3),
        vendorName:   getCellValue(4),
        uomName:      getCellValue(5),
      };

      // Skip completely empty rows
      if (parsed.sku || parsed.name || parsed.categoryName || parsed.vendorName || parsed.uomName) {
        rows.push(parsed);
      }
    });

    return rows;
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

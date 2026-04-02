import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { productsService } from './products.service';
import { productQuerySchema } from './products.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

function toArray(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

export class ProductsController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = productQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const { page, limit, search } = parsed.data;
      const categoryIds = toArray(parsed.data.categoryIds);
      const vendorIds   = toArray(parsed.data.vendorIds);

      const { data, total } = await productsService.findAll({
        page, limit, search, categoryIds, vendorIds,
      });
      res.status(200).json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.update(req.params.id, req.body, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async retireProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await productsService.retireProduct(req.params.id, req.user.id);
      res.status(200).json({ success: true, message: 'Product retired successfully' });
    } catch (err) {
      next(err);
    }
  }

  async uploadBulkProducts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }
      const ext = req.file.originalname.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx') {
        throw new ValidationError('File must be an .xlsx file');
      }
      const buffer = await productsService.processBulkUpload(req.file.buffer, req.user.id);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="bulk-upload-result.xlsx"',
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async downloadBulkTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const buffer: ExcelJS.Buffer = await productsService.generateBulkTemplate();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="bulk-product-template.xlsx"',
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}

export const productsController = new ProductsController();

import { z } from 'zod';

export const createProductSchema = z.object({
  sku:        z.string().min(1, 'SKU is required'),
  name:       z.string().min(1, 'Name is required'),
  categoryId: z.string().uuid('Category ID must be a valid UUID'),
  vendorId:   z.string().uuid('Vendor ID must be a valid UUID'),
  uomId:      z.string().uuid('UOM ID must be a valid UUID'),
});

export const updateProductSchema = z.object({
  name:       z.string().min(1, 'Name is required').optional(),
  categoryId: z.string().uuid('Category ID must be a valid UUID').optional(),
  vendorId:   z.string().uuid('Vendor ID must be a valid UUID').optional(),
  uomId:      z.string().uuid('UOM ID must be a valid UUID').optional(),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

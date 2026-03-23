import { z } from 'zod';

export const createProductRegistrationSchema = z.object({
  productId:  z.string().uuid('productId must be a valid UUID'),
  locationId: z.string().uuid('locationId must be a valid UUID'),
  isActive:   z.boolean().optional().default(true),
});

export const updateProductRegistrationSchema = z.object({
  isActive: z.boolean(),
});

export const bulkToggleSchema = z.object({
  ids:      z.array(z.string().uuid()).min(1, 'ids must be non-empty').max(100, 'ids must have at most 100 items'),
  isActive: z.boolean(),
});

export type CreateProductRegistrationDto = z.infer<typeof createProductRegistrationSchema>;
export type UpdateProductRegistrationDto = z.infer<typeof updateProductRegistrationSchema>;
export type BulkToggleDto                = z.infer<typeof bulkToggleSchema>;

import { z } from 'zod';

export const listProductRegistrationSchema = z.object({
  productId:   z.string().uuid().optional(),
  locationId:  z.string().uuid().optional(),
  productIds:  z.array(z.string().uuid()).optional(),
  locationIds: z.array(z.string().uuid()).optional(),
  status:      z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().default('ALL'),
  page:        z.coerce.number().int().positive().default(1),
  pageSize:    z.coerce.number().int().positive().max(100).default(20),
})
  .refine(
    (data) => !(data.productId && data.productIds),
    { message: 'Use either productId or productIds, not both' },
  )
  .refine(
    (data) => !(data.locationId && data.locationIds),
    { message: 'Use either locationId or locationIds, not both' },
  );

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

export type ListProductRegistrationDto   = z.infer<typeof listProductRegistrationSchema>;
export type CreateProductRegistrationDto = z.infer<typeof createProductRegistrationSchema>;
export type UpdateProductRegistrationDto = z.infer<typeof updateProductRegistrationSchema>;
export type BulkToggleDto                = z.infer<typeof bulkToggleSchema>;

import { z } from 'zod';

export const createProductRegistrationSchema = z.object({
  productId:  z.string().uuid('productId must be a valid UUID'),
  locationId: z.string().uuid('locationId must be a valid UUID'),
  isActive:   z.boolean().optional().default(true),
});

export const updateProductRegistrationSchema = z.object({
  isActive: z.boolean(),
});

export type CreateProductRegistrationDto = z.infer<typeof createProductRegistrationSchema>;
export type UpdateProductRegistrationDto = z.infer<typeof updateProductRegistrationSchema>;

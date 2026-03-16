import { z } from 'zod';

export const createCategorySchema = z.object({
  name:     z.string().min(1, 'Name is required'),
  isActive: z.boolean().optional().default(true),
});

export const updateCategorySchema = z.object({
  name:     z.string().min(1, 'Name is required').optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

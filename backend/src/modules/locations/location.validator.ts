import { z } from 'zod';

export const createLocationSchema = z.object({
  code:    z.string().min(1, 'Code is required').max(50),
  name:    z.string().min(1, 'Name is required').max(100),
  address: z.string().max(255).optional(),
});

export const updateLocationSchema = z.object({
  name:    z.string().min(1, 'Name is required').max(100),
  address: z.string().max(255).optional().nullable(),
});

export type CreateLocationDto = z.infer<typeof createLocationSchema>;
export type UpdateLocationDto = z.infer<typeof updateLocationSchema>;

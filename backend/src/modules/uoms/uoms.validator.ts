import { z } from 'zod';

export const createUomSchema = z.object({
  code: z.string().min(1, 'Code is required').toUpperCase(),
  name: z.string().min(1, 'Name is required'),
});

export type CreateUomDto = z.infer<typeof createUomSchema>;

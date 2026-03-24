import { z } from 'zod';

export const createSavedFilterSchema = z.object({
  name:       z.string().min(1, 'Name is required'),
  module:     z.string().min(1, 'Module is required'),
  filterJson: z.object({}).passthrough().default({}),
});

export type CreateSavedFilterDto = z.infer<typeof createSavedFilterSchema>;

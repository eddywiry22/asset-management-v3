import { z } from 'zod';

export const dashboardPreviewSchema = z.object({
  type: z.enum(['ADJUSTMENT', 'TRANSFER']),
  filter: z.enum(['REQUIRING_ACTION', 'IN_PROGRESS', 'READY_TO_FINALIZE', 'ARRIVING']),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type DashboardPreviewQuery = z.infer<typeof dashboardPreviewSchema>;

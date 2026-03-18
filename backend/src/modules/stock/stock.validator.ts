import { z } from 'zod';

export const stockQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  startDate:  z.string().optional(),
  endDate:    z.string().optional(),
});

export const ledgerQuerySchema = z.object({
  productId:  z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startDate:  z.string().optional(),
  endDate:    z.string().optional(),
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
});

export type StockQueryDto  = z.infer<typeof stockQuerySchema>;
export type LedgerQueryDto = z.infer<typeof ledgerQuerySchema>;

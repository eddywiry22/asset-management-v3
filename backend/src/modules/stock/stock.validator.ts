import { z } from 'zod';

const uuidOrArray = z
  .union([z.string().uuid(), z.array(z.string().uuid())])
  .optional();

export const stockQuerySchema = z.object({
  locationId:  z.string().uuid().optional(),
  productId:   z.string().uuid().optional(),
  locationIds: uuidOrArray,
  productIds:  uuidOrArray,
  categoryIds: uuidOrArray,
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().max(100).default(20),
  startDate:   z.string().optional(),
  endDate:     z.string().optional(),
});

export const ledgerQuerySchema = z.object({
  productId:   z.string().uuid().optional(),
  locationId:  z.string().uuid().optional(),
  productIds:  uuidOrArray,
  locationIds: uuidOrArray,
  startDate:   z.string().optional(),
  endDate:     z.string().optional(),
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().max(100).default(20),
});

export type StockQueryDto  = z.infer<typeof stockQuerySchema>;
export type LedgerQueryDto = z.infer<typeof ledgerQuerySchema>;

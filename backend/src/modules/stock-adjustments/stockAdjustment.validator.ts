import { z } from 'zod';

export const createRequestSchema = z.object({
  notes: z.string().optional(),
});

export const addItemSchema = z.object({
  productId:  z.string().uuid('productId must be a valid UUID'),
  locationId: z.string().uuid('locationId must be a valid UUID'),
  qtyChange:  z.number().refine((n) => n !== 0, 'qtyChange cannot be zero'),
  reason:     z.string().optional(),
});

export const updateItemSchema = z.object({
  productId:  z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  qtyChange:  z.number().refine((n) => n !== 0, 'qtyChange cannot be zero').optional(),
  reason:     z.string().optional(),
});

export const rejectRequestSchema = z.object({
  reason: z.string({ error: 'A rejection reason is required' }).min(1, 'A rejection reason is required'),
});

export const cancelRequestSchema = z.object({
  reason: z.string({ error: 'A cancellation reason is required' }).min(1, 'A cancellation reason is required'),
});

export type CreateRequestDto   = z.infer<typeof createRequestSchema>;
export type AddItemDto         = z.infer<typeof addItemSchema>;
export type UpdateItemDto      = z.infer<typeof updateItemSchema>;
export type RejectRequestDto   = z.infer<typeof rejectRequestSchema>;
export type CancelRequestDto   = z.infer<typeof cancelRequestSchema>;

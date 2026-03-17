import { z } from 'zod';

export const createTransferSchema = z.object({
  sourceLocationId:      z.string().uuid('sourceLocationId must be a valid UUID'),
  destinationLocationId: z.string().uuid('destinationLocationId must be a valid UUID'),
  notes:                 z.string().optional(),
});

export const addItemSchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  qty:       z.number().positive('qty must be greater than 0'),
});

export const updateItemSchema = z.object({
  qty: z.number().positive('qty must be greater than 0'),
});

export type CreateTransferDto = z.infer<typeof createTransferSchema>;
export type AddItemDto        = z.infer<typeof addItemSchema>;
export type UpdateItemDto     = z.infer<typeof updateItemSchema>;

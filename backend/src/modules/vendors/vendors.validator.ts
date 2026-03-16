import { z } from 'zod';

export const createVendorSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  contactInfo: z.string().min(1, 'Contact info is required'),
  isActive:    z.boolean().optional().default(true),
});

export const updateVendorSchema = z.object({
  name:        z.string().min(1, 'Name is required').optional(),
  contactInfo: z.string().min(1, 'Contact info is required').optional(),
  isActive:    z.boolean().optional(),
});

export type CreateVendorDto = z.infer<typeof createVendorSchema>;
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;

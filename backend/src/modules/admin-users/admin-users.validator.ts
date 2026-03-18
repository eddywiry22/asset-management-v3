import { z } from 'zod';

const allowedRoles = ['OPERATOR', 'MANAGER'] as const;

export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().min(1).max(30).optional().nullable(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(allowedRoles, { error: 'Role must be OPERATOR or MANAGER' }),
  locationIds: z.array(z.string().uuid('Each locationId must be a valid UUID')).default([]),
});

export const updateUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50).optional(),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().min(1).max(30).optional().nullable(),
  role: z.enum(allowedRoles, { error: 'Role must be OPERATOR or MANAGER' }).optional(),
  locationIds: z.array(z.string().uuid('Each locationId must be a valid UUID')).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

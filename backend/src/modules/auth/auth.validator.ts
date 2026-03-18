import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Username, email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

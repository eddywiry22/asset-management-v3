import prisma from '../../../config/database';
import { User } from '@prisma/client';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { phone } });
  }

  async findByEmailOrPhone(identifier: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
          { phone: identifier },
        ],
      },
    });
  }

  async findAll(): Promise<User[]> {
    return prisma.user.findMany({ where: { isActive: true } });
  }
}

export const userRepository = new UserRepository();

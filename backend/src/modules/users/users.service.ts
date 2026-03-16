import { User } from '@prisma/client';
import { userRepository } from './repositories/user.repository';
import { NotFoundError } from '../../utils/errors';

export class UsersService {
  async findById(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User not found: ${id}`);
    }
    return user;
  }

  async findAll(): Promise<User[]> {
    return userRepository.findAll();
  }
}

export const usersService = new UsersService();

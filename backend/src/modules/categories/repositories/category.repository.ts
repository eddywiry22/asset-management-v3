import prisma from '../../../config/database';
import { Category } from '@prisma/client';

export class CategoryRepository {
  async findAll(page = 1, limit = 20): Promise<{ data: Category[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.category.findMany({ skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.category.count(),
    ]);
    return { data, total };
  }

  async findById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { name } });
  }

  async create(data: { name: string; isActive?: boolean }): Promise<Category> {
    return prisma.category.create({ data });
  }

  async update(id: string, data: { name?: string; isActive?: boolean }): Promise<Category> {
    return prisma.category.update({ where: { id }, data });
  }

  async hasProducts(id: string): Promise<boolean> {
    const count = await prisma.product.count({ where: { categoryId: id } });
    return count > 0;
  }
}

export const categoryRepository = new CategoryRepository();

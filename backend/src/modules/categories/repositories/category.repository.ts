import prisma from '../../../config/database';
import { Category } from '@prisma/client';

export class CategoryRepository {
  async findAll(): Promise<Category[]> {
    return prisma.category.findMany({ orderBy: { name: 'asc' } });
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

  async hasGoods(id: string): Promise<boolean> {
    const count = await prisma.goods.count({ where: { categoryId: id } });
    return count > 0;
  }
}

export const categoryRepository = new CategoryRepository();

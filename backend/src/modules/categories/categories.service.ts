import { Category } from '@prisma/client';
import { categoryRepository } from './repositories/category.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.validator';

export class CategoriesService {
  async findAll(page: number, limit: number): Promise<{ data: Category[]; total: number }> {
    return categoryRepository.findAll(page, limit);
  }

  async findById(id: string): Promise<Category> {
    const category = await categoryRepository.findById(id);
    if (!category) throw new NotFoundError(`Category not found: ${id}`);
    return category;
  }

  async create(dto: CreateCategoryDto, performedBy: string): Promise<Category> {
    const existing = await categoryRepository.findByName(dto.name);
    if (existing) throw new ValidationError(`Category name already exists: ${dto.name}`);

    const category = await categoryRepository.create(dto);

    await auditService.log({
      entityType:  'CATEGORY',
      entityId:    category.id,
      action:      'CREATE',
      afterValue:  category,
      performedBy,
    });

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, performedBy: string): Promise<Category> {
    const before = await this.findById(id);

    if (dto.name && dto.name !== before.name) {
      const existing = await categoryRepository.findByName(dto.name);
      if (existing) throw new ValidationError(`Category name already exists: ${dto.name}`);
    }

    const updated = await categoryRepository.update(id, dto);

    await auditService.log({
      entityType:  'CATEGORY',
      entityId:    id,
      action:      'UPDATE',
      beforeValue: before,
      afterValue:  updated,
      performedBy,
    });

    return updated;
  }
}

export const categoriesService = new CategoriesService();

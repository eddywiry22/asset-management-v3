import { SavedFilter } from '@prisma/client';
import { savedFiltersRepository } from './repositories/savedFilters.repository';
import { CreateSavedFilterDto } from './savedFilters.validator';
import { NotFoundError } from '../../utils/errors';

export class SavedFiltersService {
  async getAll(userId: string, module: string): Promise<SavedFilter[]> {
    return savedFiltersRepository.findAllByUser(userId, module);
  }

  async create(dto: CreateSavedFilterDto, userId: string): Promise<SavedFilter> {
    return savedFiltersRepository.create({
      name:       dto.name,
      module:     dto.module,
      filterJson: dto.filterJson,
      createdBy:  userId,
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await savedFiltersRepository.findByIdAndUser(id, userId);
    if (!existing) {
      throw new NotFoundError('Saved filter not found');
    }
    await savedFiltersRepository.delete(id);
  }
}

export const savedFiltersService = new SavedFiltersService();

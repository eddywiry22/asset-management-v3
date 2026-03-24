import { PrismaClient, SavedFilter } from '@prisma/client';

const prisma = new PrismaClient();

export class SavedFiltersRepository {
  async findAllByUser(userId: string, module: string): Promise<SavedFilter[]> {
    return prisma.savedFilter.findMany({
      where: { createdBy: userId, module },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    name: string;
    module: string;
    filterJson: Record<string, unknown>;
    createdBy: string;
  }): Promise<SavedFilter> {
    return prisma.savedFilter.create({ data });
  }

  async findByIdAndUser(id: string, userId: string): Promise<SavedFilter | null> {
    return prisma.savedFilter.findFirst({
      where: { id, createdBy: userId },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.savedFilter.delete({ where: { id } });
  }
}

export const savedFiltersRepository = new SavedFiltersRepository();

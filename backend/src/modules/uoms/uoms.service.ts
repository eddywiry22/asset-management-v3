import { Uom } from '@prisma/client';
import { uomRepository } from './repositories/uom.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CreateUomDto } from './uoms.validator';

export class UomsService {
  async findAll(page: number, limit: number): Promise<{ data: Uom[]; total: number }> {
    return uomRepository.findAll(page, limit);
  }

  async findById(id: string): Promise<Uom> {
    const uom = await uomRepository.findById(id);
    if (!uom) throw new NotFoundError(`UOM not found: ${id}`);
    return uom;
  }

  async create(dto: CreateUomDto, performedBy: string): Promise<Uom> {
    const existing = await uomRepository.findByCode(dto.code);
    if (existing) throw new ValidationError(`UOM code already exists: ${dto.code}`);

    const uom = await uomRepository.create(dto);

    await auditService.log({
      entityType:  'UOM',
      entityId:    uom.id,
      action:      'CREATE',
      afterValue:  uom,
      performedBy,
    });

    return uom;
  }
}

export const uomsService = new UomsService();

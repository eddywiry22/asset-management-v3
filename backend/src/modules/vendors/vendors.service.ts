import { Vendor } from '@prisma/client';
import { vendorRepository } from './repositories/vendor.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError } from '../../utils/errors';
import { CreateVendorDto, UpdateVendorDto } from './vendors.validator';

export class VendorsService {
  async findAll(page: number, limit: number): Promise<{ data: Vendor[]; total: number }> {
    return vendorRepository.findAll(page, limit);
  }

  async findById(id: string): Promise<Vendor> {
    const vendor = await vendorRepository.findById(id);
    if (!vendor) throw new NotFoundError(`Vendor not found: ${id}`);
    return vendor;
  }

  async create(dto: CreateVendorDto, performedBy: string): Promise<Vendor> {
    const vendor = await vendorRepository.create(dto);

    await auditService.log({
      entityType:  'VENDOR',
      entityId:    vendor.id,
      action:      'CREATE',
      afterValue:  vendor,
      performedBy,
    });

    return vendor;
  }

  async update(id: string, dto: UpdateVendorDto, performedBy: string): Promise<Vendor> {
    const before = await this.findById(id);
    const updated = await vendorRepository.update(id, dto);

    await auditService.log({
      entityType:  'VENDOR',
      entityId:    id,
      action:      'UPDATE',
      beforeValue: before,
      afterValue:  updated,
      performedBy,
    });

    return updated;
  }
}

export const vendorsService = new VendorsService();

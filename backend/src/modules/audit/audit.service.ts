import { auditRepository, AuditLogFilters, AuditLogRow } from './audit.repository';

export class AuditQueryService {
  async findAll(filters: AuditLogFilters): Promise<{ data: AuditLogRow[]; total: number; page: number; limit: number }> {
    const { data, total } = await auditRepository.findAll(filters);
    return { data, total, page: filters.page, limit: filters.limit };
  }
}

export const auditQueryService = new AuditQueryService();

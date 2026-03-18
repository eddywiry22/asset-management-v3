import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { auditQueryService } from './audit.service';
import { ValidationError } from '../../utils/errors';
import { buildDateRangeFilter } from '../../utils/dateFilter';

export class AuditController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        dateStart,
        dateEnd,
        userId,
        entityType,
        action,
        locationId,           // backward-compat alias for sourceLocationId
        sourceLocationId,
        destinationLocationId,
        page  = '1',
        limit = '20',
      } = req.query as Record<string, string | undefined>;

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      // Validate date strings before normalising
      if (dateStart && isNaN(new Date(dateStart).getTime())) throw new ValidationError('Invalid dateStart');
      if (dateEnd   && isNaN(new Date(dateEnd).getTime()))   throw new ValidationError('Invalid dateEnd');

      // Normalise: start → 00:00:00.000, end → 23:59:59.999 (inclusive end-of-day)
      const dateFilter = buildDateRangeFilter(dateStart, dateEnd);

      const result = await auditQueryService.findAll({
        dateStart:            dateFilter?.gte,
        dateEnd:              dateFilter?.lte,
        userId:               userId               ?? undefined,
        entityType:           entityType           ?? undefined,
        action:               action               ?? undefined,
        locationId:           locationId           ?? undefined,
        sourceLocationId:     sourceLocationId     ?? undefined,
        destinationLocationId: destinationLocationId ?? undefined,
        page:  pageNum,
        limit: limitNum,
      });

      res.json({
        success: true,
        data: result.data,
        meta: {
          total: result.total,
          page:  result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();

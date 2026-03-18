import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { auditQueryService } from './audit.service';

export class AuditController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        dateStart,
        dateEnd,
        userId,
        entityType,
        action,
        locationId,
        page    = '1',
        limit   = '20',
      } = req.query as Record<string, string | undefined>;

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      const result = await auditQueryService.findAll({
        dateStart:  dateStart  ? new Date(dateStart)  : undefined,
        dateEnd:    dateEnd    ? new Date(dateEnd)    : undefined,
        userId:     userId     ?? undefined,
        entityType: entityType ?? undefined,
        action:     action     ?? undefined,
        locationId: locationId ?? undefined,
        page:       pageNum,
        limit:      limitNum,
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

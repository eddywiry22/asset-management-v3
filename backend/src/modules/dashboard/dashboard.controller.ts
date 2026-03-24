import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { getDashboardData, getPreview } from './dashboard.service';
import { dashboardPreviewSchema } from './dashboard.validator';

export async function getMyDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: userId, isAdmin } = req.user;
    const data = await getDashboardData(userId, isAdmin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPreviewController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = dashboardPreviewSchema.parse(req.query);
    const { id: userId, isAdmin } = req.user;
    const data = await getPreview({
      userId,
      isAdmin,
      type: parsed.type,
      filter: parsed.filter,
      limit: parsed.limit,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

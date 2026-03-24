import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { getDashboardData } from './dashboard.service';

export async function getMyDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: userId, isAdmin } = req.user;
    const data = await getDashboardData(userId, isAdmin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

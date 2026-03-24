import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { getMyDashboard } from './dashboard.controller';

const router = Router();

router.get('/my-actions', authMiddleware, getMyDashboard);

export default router;

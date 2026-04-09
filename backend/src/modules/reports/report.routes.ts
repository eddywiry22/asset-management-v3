import { Router } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { stockOpnameController, exportStockOpnameController } from './report.controller';

const router = Router();

// GET /v1/reports/stock-opname
// Query: startDate (req), endDate (req), locationIds (opt), categoryIds (opt)
router.get('/stock-opname', (req, res, next) =>
  stockOpnameController(req as AuthenticatedRequest, res, next),
);

// POST /v1/reports/stock-opname/export
// Body: { startDate, endDate, locationIds?, categoryIds? }
router.post('/stock-opname/export', (req, res, next) =>
  exportStockOpnameController(req as AuthenticatedRequest, res, next),
);

export default router;

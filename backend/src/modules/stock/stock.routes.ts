import { Router } from 'express';
import { stockController } from './stock.controller';

const router = Router();

// GET /v1/stock/registered-products?locationId=<id> — products registered at a location
router.get('/registered-products', (req, res, next) => stockController.getRegisteredProducts(req as any, res, next));

// GET /v1/stock/locations — locations visible to the current user (for filter dropdowns)
router.get('/locations', (req, res, next) => stockController.getVisibleLocations(req as any, res, next));

// GET /v1/stock/all-locations — all active locations (for destination selection)
router.get('/all-locations', (req, res, next) => stockController.getAllLocations(req as any, res, next));

// GET /v1/stock — stock overview (balances + period metrics)
router.get('/', (req, res, next) => stockController.getStockOverview(req as any, res, next));

// GET /v1/stock/ledger — immutable ledger entries
router.get('/ledger', (req, res, next) => stockController.getLedger(req as any, res, next));

export default router;

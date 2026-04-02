import { Router } from 'express';
import multer from 'multer';
import { productsController } from './products.controller';
import { validateBody } from '../../utils/validation';
import { createProductSchema, updateProductSchema } from './products.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { ValidationError } from '../../utils/errors';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.get('/bulk-template', adminMiddleware, (req, res, next) =>
  productsController.downloadBulkTemplate(req as AuthenticatedRequest, res, next)
);

router.post('/bulk-upload', adminMiddleware, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(new ValidationError(err.message));
    productsController.uploadBulkProducts(req as AuthenticatedRequest, res, next);
  });
});

router.get('/', (req, res, next) =>
  productsController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createProductSchema), (req, res, next) =>
  productsController.create(req as AuthenticatedRequest, res, next)
);

router.put('/:id', validateBody(updateProductSchema), (req, res, next) =>
  productsController.update(req as AuthenticatedRequest, res, next)
);

router.patch('/:id/retire', adminMiddleware, (req, res, next) =>
  productsController.retireProduct(req as AuthenticatedRequest, res, next)
);

router.patch('/:id/rename-sku', adminMiddleware, (req, res, next) =>
  productsController.renameSku(req as AuthenticatedRequest, res, next)
);

export default router;

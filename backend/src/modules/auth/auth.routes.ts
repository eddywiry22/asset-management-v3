import { Router } from 'express';
import { authController } from './auth.controller';
import { validateBody } from '../../utils/validation';
import { loginSchema } from './auth.validator';

const router = Router();

router.post('/login', validateBody(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

export default router;

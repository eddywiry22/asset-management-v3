import { Router } from "express";
import { adminUsersController } from "./admin-users.controller";
import { validateBody } from "../../utils/validation";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} from "./admin-users.validator";
import { AuthenticatedRequest } from "../../types/request.types";

const router = Router();

router.get("/", (req, res, next) =>
  adminUsersController.getAll(req as AuthenticatedRequest, res, next),
);

router.post("/", validateBody(createUserSchema), (req, res, next) =>
  adminUsersController.create(req as AuthenticatedRequest, res, next),
);

router.put("/:id", validateBody(updateUserSchema), (req, res, next) =>
  adminUsersController.update(req as AuthenticatedRequest, res, next),
);

router.patch("/:id/toggle-active", (req, res, next) =>
  adminUsersController.toggleActive(
    req as unknown as AuthenticatedRequest,
    res,
    next,
  ),
);

router.patch(
  "/:id/reset-password",
  validateBody(resetPasswordSchema),
  (req, res, next) =>
    adminUsersController.resetPassword(req as AuthenticatedRequest, res, next),
);

export default router;

import { Router } from "express";
import { locationController } from "./location.controller";
import { validateBody } from "../../utils/validation";
import {
  createLocationSchema,
  updateLocationSchema,
} from "./location.validator";
import { AuthenticatedRequest } from "../../types/request.types";

const router = Router();

router.get("/", (req, res, next) =>
  locationController.getAll(req as AuthenticatedRequest, res, next),
);

router.post("/", validateBody(createLocationSchema), (req, res, next) =>
  locationController.create(req as AuthenticatedRequest, res, next),
);

router.put("/:id", validateBody(updateLocationSchema), (req, res, next) =>
  locationController.update(req as AuthenticatedRequest, res, next),
);

router.patch("/:id/toggle-active", (req, res, next) =>
  locationController.toggleActive(
    req as unknown as AuthenticatedRequest,
    res,
    next,
  ),
);

router.get("/:id/readiness", (req, res, next) =>
  locationController.getReadiness(
    req as unknown as AuthenticatedRequest,
    res,
    next,
  ),
);

export default router;

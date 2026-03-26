import { Router, RequestHandler } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { getMyDashboard, getPreviewController } from "./dashboard.controller";

const router = Router();

router.get(
  "/my-actions",
  authMiddleware,
  getMyDashboard as unknown as RequestHandler,
);
router.get(
  "/preview",
  authMiddleware,
  getPreviewController as unknown as RequestHandler,
);

export default router;

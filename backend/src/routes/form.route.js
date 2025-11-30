import { Router } from "express";
import { protectRoute } from "../middleware/protect.route.js";
import {
  getBases,
  getTables,
  createForm,
  getFormById,
  getUserForms,
  submitResponse,
  getFormResponses,
} from "../controllers/form.controller.js";

const router = Router();

router.get("/bases", protectRoute, getBases);
router.get("/tables/:baseId", protectRoute, getTables);

router.post("/", protectRoute, createForm);
router.get("/", protectRoute, getUserForms);
router.get("/:formId/responses", protectRoute, getFormResponses);

router.get("/:id", getFormById);
router.post("/:formId/submit", submitResponse);

export default router;

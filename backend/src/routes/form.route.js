import { Router } from "express";
import { protectRoute } from "../middleware/protect.route.js";
// 1. IMPORT createForm HERE
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

// 2. EXISTING ROUTES (These work fine)
router.get("/bases", protectRoute, getBases);
router.get("/tables/:baseId", protectRoute, getTables);

// 3. ADD THIS MISSING ROUTE (The "Save" Door)
router.post("/", protectRoute, createForm);
router.get("/", protectRoute, getUserForms);
router.get("/:formId/responses", protectRoute, getFormResponses);

router.get("/:id", getFormById);
router.post("/:formId/submit", submitResponse);

export default router;

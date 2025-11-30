import { Router } from "express";
import {
  handleAirtableWebhook,
  registerWebhook,
} from "../controllers/webhook.controller.js";
import { protectRoute } from "../middleware/protect.route.js";

const router = Router();

router.post("/register/:baseId", protectRoute, registerWebhook);
router.post("/airtable", handleAirtableWebhook);

export default router;

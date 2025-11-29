import { Router } from "express";
import {
  handleAirtableWebhook,
  registerWebhook,
} from "../controllers/webhook.controller.js";
import { protectRoute } from "../middleware/protect.route.js";

const router = Router();

// 1. Setup Route (You trigger this manually/via button to start listening)
router.post("/register/:baseId", protectRoute, registerWebhook);

// 2. Listener Route (Airtable triggers this)
// NO protectRoute here! Airtable doesn't have your cookies.
router.post("/airtable", handleAirtableWebhook);

export default router;

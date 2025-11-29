import { Router } from "express";
import {
  login,
  callback,
  logout,
  checkAuth,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/protect.route.js"; // Adjust path as needed

const router = Router();

// OAuth Routes
router.get("/login", login);
router.get("/callback", callback);

// Session Management Routes
router.post("/logout", logout);
router.get("/me", protectRoute, checkAuth); // React calls this to see if logged in

export default router;

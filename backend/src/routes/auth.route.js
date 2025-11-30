import { Router } from "express";
import {
  login,
  callback,
  logout,
  checkAuth,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/protect.route.js";

const router = Router();

router.get("/login", login);
router.get("/callback", callback);

router.post("/logout", logout);
router.get("/me", protectRoute, checkAuth);

export default router;

import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.route.js";
import { connectDB } from "./lib/db.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import formRoutes from "./routes/form.route.js";
import webhookRoutes from "./routes/webhook.route.js";

dotenv.config();
const app = express();

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

const PORT = process.env.PORT;

app.use(express.json());
app.use(cookieParser());
app.get("/", (req, res) => res.send("ok"));
app.use("/api/webhooks", webhookRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/forms", formRoutes);

app.listen(5000, () => {
  console.log(`server started  on port ${PORT}`);
  connectDB();
});

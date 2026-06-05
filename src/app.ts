import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import voiceRoutes from "./routes/voice.routes";
import "./config/env";

const app = express();
const FRONTEND_URL_RAW = process.env.FRONTEND_URL || "http://localhost:5173";
const envOrigins = FRONTEND_URL_RAW.split(",").map((url) => url.trim()).filter(Boolean);
const allowedOrigins = Array.from(new Set([
  ...envOrigins,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]));

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date() }));
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/voice", voiceRoutes);

export default app;
import http from "http";
import app from "./app";
import { connectDB } from "./config/db";

import 'dotenv/config';

const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "auralist_dev";

// ─── HTTP server wrapping Express ─────────────────────────────────────────────
const server = http.createServer(app);

// ─── Start ────────────────────────────────────────────────────────────────────
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Auralist API  →  http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  });
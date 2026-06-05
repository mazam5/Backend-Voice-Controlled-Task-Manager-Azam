import "./config/env";

import http from "http";
import app from "./app";
import { connectDB } from "./config/db";
import { initWebSocket } from "./config/websocket";

const PORT = Number(process.env.PORT) || 5000;

// Wraps Express app inside http server
const server = http.createServer(app);

// Initializes WebSocket server on top of HTTP server
initWebSocket(server);

// Connects to Database and starts listening for requests
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚀 Auralist API  →  http://localhost:${PORT}`);
        console.log(`🔌 WebSocket    →  ws://localhost:${PORT}/ws`);
      }
      if (!process.env.GEMINI_API_KEY) {
        console.warn("⚠️  GEMINI_API_KEY not set — voice agent will not work!");
      }
    });
  })
  .catch((err: any) => {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  });
import { WebSocketServer, WebSocket, RawData } from "ws";
import http from "http";
import jwt from "jsonwebtoken";
import { processGeminiVoiceAgent, clearSession } from "../services/gemini.service";

const JWT_SECRET = process.env.JWT_SECRET || "auralist_dev_secret_change_me";

export interface AuraSocket extends WebSocket {
  userId?: number;
  isAlive: boolean;
}

export const initWebSocket = (server: http.Server) => {
  const wss = new WebSocketServer({ server });

  // Keep-alive ping every 30 s
  const pingInterval = setInterval(() => {
    wss.clients.forEach((rawWs) => {
      const ws = rawWs as AuraSocket;
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on("close", () => clearInterval(pingInterval));

  wss.on("connection", (rawWs: WebSocket) => {
    const ws = rawWs as AuraSocket;
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const send = (payload: object) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    ws.on("message", async (rawData: RawData) => {
      let msg: any;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        send({ type: "error", message: "Invalid JSON" });
        return;
      }

      // 1. AUTH
      if (msg.type === "auth") {
        const { token } = msg;
        if (!token) {
          send({ type: "error", message: "Token required" });
          return;
        }

        try {
          const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
          ws.userId = decoded.userId;
          console.log(`✅ WS authenticated → User ${ws.userId}`);
          send({ type: "auth_success", message: "Authenticated" });
        } catch {
          send({ type: "error", message: "Invalid or expired token" });
          ws.close(4003, "Unauthorized");
        }
        return;
      }

      // 2. SESSION RESET
      if (msg.type === "reset") {
        if (ws.userId) clearSession(ws.userId);
        send({ type: "reset_ok" });
        return;
      }

      // 3. TRANSCRIPT (STT text from browser Web Speech API)
      if (msg.type === "transcript") {
        if (!ws.userId) {
          send({ type: "error", message: "Not authenticated" });
          return;
        }

        const text: string = (msg.text || "").trim();
        if (!text) {
          send({ type: "error", message: "Empty transcript" });
          return;
        }

        console.log(`📩 Transcript from User ${ws.userId}: "${text}"`);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          send({ type: "error", message: "Gemini API key not configured on server" });
          return;
        }

        // Signal frontend that processing has started
        send({ type: "thinking" });

        try {
          const result = await processGeminiVoiceAgent(ws.userId, text, apiKey);
          console.log(`✅ Agent responded for User ${ws.userId}: "${result.textResponse.slice(0, 80)}..."`);

          send({
            type: "response",
            text: result.textResponse,
            tasks: result.tasks,
            log: result.log,
          });
        } catch (err: any) {
          console.error(`❌ Agent error for User ${ws.userId}:`, err.message);
          send({ type: "error", message: `Agent error: ${err.message}` });
        }
        return;
      }

      send({ type: "error", message: `Unknown message type: ${msg.type}` });
    });

    ws.on("close", () => {
      console.log(`🔴 WS disconnected — User ${ws.userId ?? "unauthenticated"}`);
    });

    ws.on("error", (err) => {
      console.error(`WS error (User ${ws.userId ?? "?"}):`, err.message);
    });
  });

  return wss;
};

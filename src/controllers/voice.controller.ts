import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { clearSession, transcribeAudio, processGeminiVoiceAgent } from "../services/gemini.service";

// HTTP REST fallback — WebSocket is the primary voice path.
// This endpoint only resets the conversation session.
export const resetSession = async (req: AuthRequest, res: Response): Promise<void> => {
  clearSession(req.user!.userId);
  res.json({ message: "Session cleared" });
};

// Handle POST /api/voice/chat for the main voice pipeline
export const voiceChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      res.status(400).json({ message: "No audio file provided in request." });
      return;
    }

    console.log(`🎙️ Voice Chat received: ${file.size} bytes, mimeType: ${file.mimetype}`);

    // Step 1: Speech-to-text (ASR)
    console.log("Speech-to-text (ASR) beginning...");
    const transcript = await transcribeAudio(file.buffer, file.mimetype);
    console.log(`Speech-to-text result: "${transcript}"`);

    if (!transcript || transcript.trim() === "") {
      res.json({
        transcript: "",
        textResponse: "I couldn't hear anything. Please try speaking again.",
      });
      return;
    }

    // Step 2: LLM extracts intent/entities & executes CRUD in Task Manager Engine
    console.log("Processing transcript with Gemini Agent...");
    const agentResult = await processGeminiVoiceAgent(userId, transcript);
    console.log(`Agent response: "${agentResult.textResponse}"`);

    // Step 3: Respond to user
    res.json({
      transcript,
      textResponse: agentResult.textResponse,
      tasks: agentResult.tasks,
      log: agentResult.log,
    });
  } catch (err: any) {
    console.error("CRITICAL error in voiceChat handler:", err);
    res.status(500).json({ message: `Voice processing error: ${err.message}` });
  }
};
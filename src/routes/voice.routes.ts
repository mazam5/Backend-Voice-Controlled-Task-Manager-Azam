import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth.middleware";
import { resetSession, voiceChat } from "../controllers/voice.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate as any);
router.post("/reset", resetSession);
router.post("/chat", upload.single("audio"), voiceChat as any);

export default router;
import { GoogleGenAI } from '@google/genai';
import "./env";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
} as any);

export default ai;

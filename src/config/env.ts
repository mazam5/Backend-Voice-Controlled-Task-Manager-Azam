import dotenv from "dotenv";
import path from "path";

const nodeEnv = process.env.NODE_ENV || "development";

// Load environment-specific file
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${nodeEnv}`),
});

// Fallback to default .env
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

console.log(`📡 Environment loaded: ${nodeEnv}`);

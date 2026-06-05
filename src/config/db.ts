import { Pool } from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

export let isPostgresConnected = false;

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "mydb",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

// JSON fallback file path
export const JSON_DB_DIR = path.join(__dirname, "../../data");
export const JSON_DB_PATH = path.join(JSON_DB_DIR, "db.json");

// Initialize JSON database file
const initJSONDb = () => {
  try {
    if (!fs.existsSync(JSON_DB_DIR)) {
      fs.mkdirSync(JSON_DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(JSON_DB_PATH)) {
      const initialData = {
        users: [],
        tasks: []
      };
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(initialData, null, 2), "utf-8");
      console.log("Local JSON Database initialized at:", JSON_DB_PATH);
    }
  } catch (err: any) {
    console.error("Failed to initialize JSON database fallback:", err.message);
  }
};

export const connectDB = async () => {
  initJSONDb();
  try {
    // Attempt connecting to PostgreSQL
    const client = await pool.connect();
    console.log("PostgreSQL connected successfully");
    isPostgresConnected = true;
    client.release();

    // Create tables if they do not exist
    await initPostgresTables();
  } catch (error: any) {
    console.warn("==================================================================");
    console.warn("PostgreSQL connection failed:", error.message);
    console.warn("Falling back to local persistent JSON file database!");
    console.warn("==================================================================");
    isPostgresConnected = false;
  }
};

const initPostgresTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("users table created");
    
  } catch (err: any) {
    console.error("Failed to initialize PostgreSQL tables:", err.message);
    isPostgresConnected = false;
    console.warn("Falling back to local persistent JSON database due to table initialization failure.");
  }
};
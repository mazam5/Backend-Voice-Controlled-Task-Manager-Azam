import { Request, Response } from "express";
import { pool, isPostgresConnected, JSON_DB_PATH } from "../config/db";
import fs from "fs";

interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
  created_at?: string;
}

interface Task {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  scheduled_at: string;
  completed: boolean;
  created_at?: string;
  updated_at?: string;
}

const readJsonDb = (): { users: User[]; tasks: Task[] } => {
  try {
    const data = fs.readFileSync(JSON_DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return { users: [], tasks: [] };
  }
};

/**
 * Returns a combined dump of both users and tasks
 */
export const getDatabaseLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    let users: User[] = [];
    let tasks: Task[] = [];

    if (isPostgresConnected) {
      const usersResult = await pool.query<User>("SELECT id, name, email, created_at FROM users ORDER BY id ASC");
      users = usersResult.rows;

      const tasksResult = await pool.query<Task>("SELECT * FROM tasks ORDER BY id ASC");
      tasks = tasksResult.rows;
    } else {
      const db = readJsonDb();
      users = db.users.map(({ password, ...u }) => u);
      tasks = db.tasks;
    }

    res.json({
      success: true,
      source: isPostgresConnected ? "postgresql" : "json_fallback",
      data: {
        users,
        tasks
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch database logs", error: error.message });
  }
};

/**
 * Returns all user records (without password hashes)
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    let users: User[] = [];

    if (isPostgresConnected) {
      const result = await pool.query<User>("SELECT id, name, email, created_at FROM users ORDER BY id ASC");
      users = result.rows;
    } else {
      const db = readJsonDb();
      users = db.users.map(({ password, ...u }) => u);
    }

    res.json({
      success: true,
      source: isPostgresConnected ? "postgresql" : "json_fallback",
      count: users.length,
      data: users
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch users", error: error.message });
  }
};

/**
 * Returns all task records
 */
export const getAllTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    let tasks: Task[] = [];

    if (isPostgresConnected) {
      const result = await pool.query<Task>("SELECT * FROM tasks ORDER BY id ASC");
      tasks = result.rows;
    } else {
      const db = readJsonDb();
      tasks = db.tasks;
    }

    res.json({
      success: true,
      source: isPostgresConnected ? "postgresql" : "json_fallback",
      count: tasks.length,
      data: tasks
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to fetch tasks", error: error.message });
  }
};

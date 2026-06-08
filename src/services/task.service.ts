import { pool, isPostgresConnected, JSON_DB_PATH } from "../config/db";
import fs from "fs";

export interface Task {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  scheduled_at: string;
  completed: boolean;
  created_at?: string;
  updated_at?: string;
}

const readJsonDb = (): { users: any[]; tasks: Task[] } => {
  try {
    const data = fs.readFileSync(JSON_DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return { users: [], tasks: [] };
  }
};

const writeJsonDb = (data: { users: any[]; tasks: Task[] }) => {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to JSON db:", err);
  }
};

export const createTask = async (
  userId: number,
  title: string,
  scheduledAt: string | Date,
  description = ""
): Promise<Task> => {
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) throw new Error("Invalid date for scheduledAt: " + scheduledAt);
  const isoDate = d.toISOString();

  if (isPostgresConnected) {
    // Check for duplicate task (same title and same scheduled_at for the user)
    const existing = await pool.query(
      "SELECT id FROM tasks WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND scheduled_at = $3",
      [userId, title.trim(), isoDate]
    );
    if (existing.rows.length > 0) {
      throw new Error(`Task with title "${title}" scheduled at this time already exists.`);
    }

    const { rows } = await pool.query<Task>(
      `INSERT INTO tasks (user_id, title, description, scheduled_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, title.trim(), description.trim(), isoDate]
    );
    return rows[0]!;
  } else {
    const db = readJsonDb();
    
    // Check for duplicate task
    const duplicate = db.tasks.find(
      t => t.user_id === userId &&
           t.title.toLowerCase() === title.trim().toLowerCase() &&
           new Date(t.scheduled_at).getTime() === d.getTime()
    );
    if (duplicate) {
      throw new Error(`Task with title "${title}" scheduled at this time already exists.`);
    }

    const id = db.tasks.length > 0 ? Math.max(...db.tasks.map(t => t.id)) + 1 : 1;
    const newTask: Task = {
      id,
      user_id: userId,
      title: title.trim(),
      description: description.trim(),
      scheduled_at: isoDate,
      completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.tasks.push(newTask);
    writeJsonDb(db);
    return newTask;
  }
};

export const getUserTasks = async (userId: number): Promise<Task[]> => {
  if (isPostgresConnected) {
    const { rows } = await pool.query<Task>(
      "SELECT * FROM tasks WHERE user_id = $1 ORDER BY scheduled_at ASC",
      [userId]
    );
    return rows;
  } else {
    const db = readJsonDb();
    return db.tasks
      .filter(t => t.user_id === userId)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }
};

export const getTaskById = async (userId: number, taskId: number): Promise<Task | null> => {
  if (isPostgresConnected) {
    const { rows } = await pool.query<Task>(
      "SELECT * FROM tasks WHERE user_id = $1 AND id = $2",
      [userId, taskId]
    );
    return rows[0] ?? null;
  } else {
    const db = readJsonDb();
    return db.tasks.find(t => t.user_id === userId && t.id === taskId) ?? null;
  }
};

export const updateTask = async (
  userId: number,
  taskId: number,
  updates: {
    title?: string;
    scheduled_at?: string | Date;
    completed?: boolean;
    description?: string;
  }
): Promise<Task | null> => {
  if (isPostgresConnected) {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (updates.title !== undefined) { setClauses.push(`title = $${i++}`); values.push(updates.title.trim()); }
    if (updates.description !== undefined) { setClauses.push(`description = $${i++}`); values.push(updates.description.trim()); }
    if (updates.completed !== undefined) { setClauses.push(`completed = $${i++}`); values.push(updates.completed); }
    if (updates.scheduled_at !== undefined) {
      const d = new Date(updates.scheduled_at);
      if (isNaN(d.getTime())) throw new Error("Invalid date for scheduled_at");
      setClauses.push(`scheduled_at = $${i++}`);
      values.push(d.toISOString());
    }

    if (setClauses.length === 0) return getTaskById(userId, taskId);

    setClauses.push(`updated_at = NOW()`);
    values.push(userId, taskId);

    const { rows } = await pool.query<Task>(
      `UPDATE tasks SET ${setClauses.join(", ")} WHERE user_id = $${i++} AND id = $${i++} RETURNING *`,
      values
    );
    return rows[0] ?? null;
  } else {
    const db = readJsonDb();
    const taskIdx = db.tasks.findIndex(t => t.user_id === userId && t.id === taskId);
    if (taskIdx === -1) return null;

    const task = db.tasks[taskIdx]!;
    if (updates.title !== undefined) task.title = updates.title.trim();
    if (updates.description !== undefined) task.description = updates.description.trim();
    if (updates.completed !== undefined) task.completed = updates.completed;
    if (updates.scheduled_at !== undefined) {
      const d = new Date(updates.scheduled_at);
      if (isNaN(d.getTime())) throw new Error("Invalid date for scheduled_at");
      task.scheduled_at = d.toISOString();
    }
    task.updated_at = new Date().toISOString();

    db.tasks[taskIdx] = task;
    writeJsonDb(db);
    return task;
  }
};

export const deleteTask = async (userId: number, taskId: number): Promise<boolean> => {
  if (isPostgresConnected) {
    const { rowCount } = await pool.query(
      "DELETE FROM tasks WHERE user_id = $1 AND id = $2",
      [userId, taskId]
    );
    return (rowCount ?? 0) > 0;
  } else {
    const db = readJsonDb();
    const taskIdx = db.tasks.findIndex(t => t.user_id === userId && t.id === taskId);
    if (taskIdx === -1) return false;

    db.tasks.splice(taskIdx, 1);
    writeJsonDb(db);
    return true;
  }
};
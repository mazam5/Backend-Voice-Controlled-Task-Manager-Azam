import { pool } from "../config/db";

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

export const createTask = async (
  userId: number,
  title: string,
  scheduledAt: string | Date,
  description = ""
): Promise<Task> => {
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) throw new Error("Invalid date for scheduledAt: " + scheduledAt);
  const { rows } = await pool.query<Task>(
    `INSERT INTO tasks (user_id, title, description, scheduled_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, title, description, d.toISOString()]
  );
  return rows[0]!;
};

export const getUserTasks = async (userId: number): Promise<Task[]> => {
  const { rows } = await pool.query<Task>(
    "SELECT * FROM tasks WHERE user_id = $1 ORDER BY scheduled_at ASC",
    [userId]
  );
  return rows;
};

export const getTaskById = async (userId: number, taskId: number): Promise<Task | null> => {
  const { rows } = await pool.query<Task>(
    "SELECT * FROM tasks WHERE user_id = $1 AND id = $2",
    [userId, taskId]
  );
  return rows[0] ?? null;
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
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined) { setClauses.push(`title = $${i++}`); values.push(updates.title); }
  if (updates.description !== undefined) { setClauses.push(`description = $${i++}`); values.push(updates.description); }
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
};

export const deleteTask = async (userId: number, taskId: number): Promise<boolean> => {
  const { rowCount } = await pool.query(
    "DELETE FROM tasks WHERE user_id = $1 AND id = $2",
    [userId, taskId]
  );
  return (rowCount ?? 0) > 0;
};
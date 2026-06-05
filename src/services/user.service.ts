import { pool, isPostgresConnected, JSON_DB_PATH } from "../config/db";
import fs from "fs";

export interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
  created_at?: Date | string;
}

const readJsonDb = (): { users: User[]; tasks: any[] } => {
  try {
    const data = fs.readFileSync(JSON_DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return { users: [], tasks: [] };
  }
};

const writeJsonDb = (data: { users: User[]; tasks: any[] }) => {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to JSON db:", err);
  }
};

export const createUser = async (name: string, email: string, passwordHash: string): Promise<User> => {
  if (isPostgresConnected) {
    const result = await pool.query(
      `
      INSERT INTO users(name, email, password)
      VALUES($1, $2, $3)
      RETURNING id, name, email, created_at
      `,
      [name, email, passwordHash]
    );
    return result.rows[0];
  } else {
    const db = readJsonDb();
    const id = db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1;
    const newUser: User = {
      id,
      name,
      email,
      password: passwordHash,
      created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    writeJsonDb(db);
    // return copy without password
    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  if (isPostgresConnected) {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0] || null;
  } else {
    const db = readJsonDb();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  }
};

export const getUserById = async (id: number): Promise<User | null> => {
  if (isPostgresConnected) {
    const result = await pool.query("SELECT id, name, email, created_at FROM users WHERE id = $1", [id]);
    return result.rows[0] || null;
  } else {
    const db = readJsonDb();
    const user = db.users.find(u => u.id === id);
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
};

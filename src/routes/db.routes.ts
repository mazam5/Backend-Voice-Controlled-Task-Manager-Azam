import { Router } from "express";
import { getDatabaseLogs, getAllUsers, getAllTasks } from "../controllers/db.controller";

const router = Router();

// Public routes for logs and raw table reads
router.get("/logs", getDatabaseLogs);
router.get("/users", getAllUsers);
router.get("/tasks", getAllTasks);

export default router;

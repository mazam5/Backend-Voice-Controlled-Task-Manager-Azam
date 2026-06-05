import { Router } from "express";
import { getTasks, createTask, updateTask, deleteTask } from "../controllers/task.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Apply auth middleware to all task routes
router.use(authenticate as any);

router.get("/", getTasks);
router.post("/", createTask);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;

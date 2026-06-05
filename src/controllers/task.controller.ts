import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as taskService from "../services/task.service";

export const getTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const tasks = await taskService.getUserTasks(userId);
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to get tasks", error: error.message });
  }
};

export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { title, scheduled_at, description } = req.body;
    if (!title || !scheduled_at) {
      res.status(400).json({ message: "Title and scheduled_at are required" });
      return;
    }

    const task = await taskService.createTask(userId, title, scheduled_at, description);
    res.status(201).json(task);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create task", error: error.message });
  }
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const taskId = Number(req.params.id);

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const updates = req.body;
    const task = await taskService.updateTask(userId, taskId, updates);

    if (!task) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update task", error: error.message });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const taskId = Number(req.params.id);

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const deleted = await taskService.deleteTask(userId, taskId);
    if (!deleted) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to delete task", error: error.message });
  }
};
